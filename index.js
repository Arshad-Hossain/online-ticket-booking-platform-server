// const dns = require('node:dns');
// dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("ticketbari");
    const ticketsCollection = db.collection("tickets");
    const bookingsCollection = db.collection("bookings");

    //adding ticket

    app.post("/api/tickets", async (req, res) => {
      try {
        const ticket = req.body;

        const newTicket = {
          ...ticket,
          verificationStatus: "pending",
          createdAt: new Date(),
        };

        const result = await ticketsCollection.insertOne(newTicket);

        res.status(201).send({
          success: true,
          message: "Ticket added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to add ticket",
        });
      }
    });

    //getting vendors added tickets
    app.get("/api/tickets/vendor/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const tickets = await ticketsCollection
          .find({ vendorEmail: email })
          .toArray();

        res.send(tickets);
      } catch (error) {
        res.status(500).send({ message: "Failed to load tickets" });
      }
    });

    // delete ticket
    app.delete("/api/tickets/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ticketsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Delete failed" });
      }
    });

    //update ticket
    app.put("/api/tickets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await ticketsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: updatedData,
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });

    //getting vendor booking requests
    app.get("/api/bookings/vendor/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const bookings = await bookingsCollection
          .find({ vendorEmail: email })
          .toArray();

        res.send(bookings);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to get bookings" });
      }
    });

    // updating like accepting or rejecting booking
    app.patch("/api/bookings/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
            },
          },
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update booking" });
      }
    });

    //vendor revenue api
    app.get("/api/revenue/vendor/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // 1. tickets added
        const tickets = await ticketsCollection
          .find({ vendorEmail: email })
          .toArray();

        // 2. bookings (sold tickets)
        const bookings = await bookingsCollection
          .find({
            vendorEmail: email,
            status: "accepted",
          })
          .toArray();

        const totalTicketsAdded = tickets.length;

        const totalTicketsSold = bookings.reduce(
          (acc, b) => acc + (b.quantity || 0),
          0,
        );

        const totalRevenue = bookings.reduce(
          (acc, b) => acc + (b.quantity * b.unitPrice || 0),
          0,
        );

        res.send({
          totalTicketsAdded,
          totalTicketsSold,
          totalRevenue,
          chart: [
            { name: "Added", value: totalTicketsAdded },
            { name: "Sold", value: totalTicketsSold },
            { name: "Revenue", value: totalRevenue },
          ],
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load revenue" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running Ok!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
