const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log("token in middleware:", token);
  if (!token) {
    return res.status(401).send({ message: "Not Authorized" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      res.status(401).send({ message: "Not Authorized" });
    }

    console.log("value of token in decoded", decoded);
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wlof2pa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const serviceCollection = client.db("carDoctor").collection("servicesDB");
    const bookingsCollection = client.db("carDoctor").collection("bookings");

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false, //for production, it should be true
        })
        .send({ success: true });
    });

    // clear token from cookie when user logged out
    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("log out user", user);
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // service related api
    app.get("/services", async (req, res) => {
      const filter = req.query;
      const query = {};
      console.log(filter);
      const options = {
        sort: {
          price: filter.sort === 'asc' ? 1 : -1,
        }
      };
      const sortOrder = filter.sort === 'asc' ? 1 : -1;
      const result = await serviceCollection.aggregate([
        {
          $addFields:{
            // this field convert price value from string to number
            priceAsNumber: { $toDouble: '$price'} 
          }
        },
        {
          $sort: {
            // this field sorts among the converted numbers
            priceAsNumber: sortOrder
          }
        }
      ]).toArray();
      res.send(result);
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.findOne(query);
      res.send(result);
    });

    // to get selected data and speecific field:
    app.get("/service/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = {
        projection: { title: 1, price: 1, img: 1, service_id: 1 },
      };
      const result = await serviceCollection.findOne(query, options);
      res.send(result);
    });

    // api for post a booking
    app.post("/bookings", async (req, res) => {
      const order = req.body;
      const result = await bookingsCollection.insertOne(order);
      res.send(result);
    });

    // api for getting specific booking data by query parameter
    app.get("/bookings", verifyToken, async (req, res) => {
      // console.log('user in the valid token', req.user);

      if (req.query.email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // api for delete a booking
    app.delete("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // update a booking status
    app.patch("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const updateStatus = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: updateStatus.status,
        },
      };
      const result = await bookingsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Car doctor server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
