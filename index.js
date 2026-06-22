// const dns = require('node:dns');
// dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.NEXT_PUBLIC_CLIENT_URL],
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
    const usersCollection = db.collection("user");
    const transactionsCollection = db.collection("transactions");

    //adding ticket

    // app.post("/api/tickets", async (req, res) => {
    //   try {
    //     const ticket = req.body;

    //     const newTicket = {
    //       ...ticket,
    //       verificationStatus: "pending",
    //       createdAt: new Date(),
    //     };

    //     const result = await ticketsCollection.insertOne(newTicket);

    //     res.status(201).send({
    //       success: true,
    //       message: "Ticket added successfully",
    //       insertedId: result.insertedId,
    //     });
    //   } catch (error) {
    //     console.error(error);

    //     res.status(500).send({
    //       success: false,
    //       message: "Failed to add ticket",
    //     });
    //   }
    // });

    app.post("/api/tickets", async (req, res) => {
      try {
        const ticket = req.body;

        if (!ticket?.vendorEmail) {
          return res.status(400).send({
            success: false,
            message: "Vendor email is required",
          });
        }

        // Check vendor
        const vendor = await usersCollection.findOne({
          email: ticket.vendorEmail,
        });

        if (!vendor) {
          return res.status(404).send({
            success: false,
            message: "Vendor not found",
          });
        }

        if (vendor.isFraud) {
          return res.status(403).send({
            success: false,
            message: "Fraud vendors cannot add tickets",
          });
        }

        const newTicket = {
          ...ticket,
          verificationStatus: "pending",
          isHidden: false,
          isAdvertised: false,
          createdAt: new Date(),
        };

        const result = await ticketsCollection.insertOne(newTicket);

        return res.status(201).send({
          success: true,
          message: "Ticket added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).send({
          success: false,
          message: "Failed to add ticket",
        });
      }
    });

    //getting tickets
    app.get("/api/tickets", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({
            verificationStatus: "approved",
            isHidden: { $ne: true },
          })
          .toArray();

        res.send(tickets);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Failed to fetch tickets",
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

        const ticket = await ticketsCollection.findOne({
          _id: new ObjectId(id),
        });

        const vendor = await usersCollection.findOne({
          email: ticket.vendorEmail,
        });

        if (vendor?.isFraud) {
          return res.status(403).send({
            success: false,
            message: "Fraud vendors cannot delete tickets",
          });
        }

        const result = await ticketsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Delete failed",
        });
      }
    });

    //update ticket
    app.put("/api/tickets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const ticket = await ticketsCollection.findOne({
          _id: new ObjectId(id),
        });

        const vendor = await usersCollection.findOne({
          email: ticket.vendorEmail,
        });

        if (vendor?.isFraud) {
          return res.status(403).send({
            success: false,
            message: "Fraud vendors cannot update tickets",
          });
        }

        const result = await ticketsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: updatedData,
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Update failed",
        });
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

    // admin getting all tickets
    app.get("/api/admin/tickets", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(tickets);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch tickets" });
      }
    });

    // admin patching ticket
    app.patch("/api/admin/tickets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // "approved" or "rejected"

        const result = await ticketsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              verificationStatus: status,
            },
          },
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update ticket status" });
      }
    });

    // admin getting all users
    app.get("/api/admin/users", async (req, res) => {
      try {
        const users = await usersCollection.find({}).toArray();

        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // admin updating user roles
    app.patch("/api/admin/users/:id/role", async (req, res) => {
      try {
        const { role } = req.body;
        const id = req.params.id;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              signupAs: role,
            },
          },
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update role" });
      }
    });

    // adming marking user/vendor as fraud
    app.patch("/api/admin/users/:id/fraud", async (req, res) => {
      try {
        const id = req.params.id;

        const vendor = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!vendor) {
          return res.status(404).send({
            message: "Vendor not found",
          });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isFraud: true,
            },
          },
        );

        await ticketsCollection.updateMany(
          {
            vendorEmail: vendor.email,
          },
          {
            $set: {
              isHidden: true,
            },
          },
        );

        res.send({
          success: true,
          message: "Vendor marked as fraud",
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Failed to mark vendor as fraud",
        });
      }
    });

    // get all approved tickets by admin
    app.get("/api/admin/advertisements", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({
            verificationStatus: "approved",
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(tickets);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to fetch tickets",
        });
      }
    });

    // enforcing 6 advertised tickets
    app.patch("/api/admin/advertisements/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const ticket = await ticketsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!ticket) {
          return res.status(404).send({
            success: false,
            message: "Ticket not found",
          });
        }

        const isCurrentlyAdvertised = ticket.isAdvertised === true;

        // If trying to TURN ON advertise
        if (!isCurrentlyAdvertised) {
          const advertisedCount = await ticketsCollection.countDocuments({
            isAdvertised: true,
          });

          if (advertisedCount >= 6) {
            return res.status(400).send({
              success: false,
              message: "Maximum 6 tickets can be advertised",
            });
          }
        }

        const result = await ticketsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isAdvertised: !isCurrentlyAdvertised,
            },
          },
        );

        res.send({
          success: true,
          message: "Advertisement updated",
          result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to update advertisement",
        });
      }
    });

    // display advertised tickets on homepage
    app.get("/api/advertisements", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({
            isAdvertised: true,
            verificationStatus: "approved",
            isHidden: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(tickets);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to load advertisements",
        });
      }
    });

    // ticket details page
    app.get("/api/tickets/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const ticket = await ticketsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!ticket) {
          return res.status(404).send({
            message: "Ticket not found",
          });
        }

        res.send(ticket);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Failed to fetch ticket",
        });
      }
    });

    // api for latest tickets
    app.get("/api/latest-tickets", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({
            verificationStatus: "approved",
            isHidden: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.send(tickets);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Failed to load latest tickets",
        });
      }
    });

    //booking posting api

    app.post("/api/bookings", async (req, res) => {
      try {
        const booking = req.body;

        const ticket = await ticketsCollection.findOne({
          _id: new ObjectId(booking.ticketId),
        });

        if (!ticket) {
          return res.status(404).send({
            success: false,
            message: "Ticket not found",
          });
        }

        if (ticket.quantity < booking.quantity) {
          return res.status(400).send({
            success: false,
            message: "Not enough tickets available",
          });
        }

        const newBooking = {
          ...booking,
          status: "pending",
          bookedAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(newBooking);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Booking failed",
        });
      }
    });

    //getting my-booked tickets
    app.get("/api/bookings/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const bookings = await bookingsCollection
          .find({
            userEmail: email,
          })
          .sort({
            bookedAt: -1,
          })
          .toArray();

        res.send(bookings);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to load bookings",
        });
      }
    });

    // api for posting payment

    // getting transaction details
    app.get("/api/transactions/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const transactions = await transactionsCollection
          .find({
            userEmail: email,
          })
          .sort({
            transactionDate: -1,
          })
          .toArray();

        res.send(transactions);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to load transactions",
        });
      }
    });

    //stripe checkout session
    app.post("/api/stripe/checkout", async (req, res) => {
      try {
        const { booking } = req.body;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",

          // ✅ THIS FIXES EMAIL
          customer_email: booking.userEmail,

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: booking.title,
                },
                unit_amount: booking.unitPrice * 100,
              },
              quantity: booking.quantity,
            },
          ],

          success_url: `${process.env.NEXT_PUBLIC_CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&bookingId=${booking._id}`,
          cancel_url: `${process.env.NEXT_PUBLIC_CLIENT_URL}/my-booked-tickets`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Stripe checkout failed",
        });
      }
    });

    // payment confirm
    app.post("/api/payments/confirm", async (req, res) => {
      try {
        const { bookingId, sessionId } = req.body;

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.status(400).send({
            success: false,
            message: "Payment not completed",
          });
        }

        // update booking
        await bookingsCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status: "paid" } },
        );

        // save transaction
        await transactionsCollection.insertOne({
          bookingId,
          sessionId,
          amount: session.amount_total / 100,
          currency: session.currency,
          userEmail: session.customer_details?.email,
          transactionDate: new Date(),
        });

        res.send({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Payment confirmation failed",
        });
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
