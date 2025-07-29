require('dotenv').config()
const express = require('express');
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.PAYMENT_SK);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173"
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE',"PATCH"],
    credentials: true,
  })
);
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2trpp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server (optional starting in v4.7)
        // await client.connect();

        // database collection 
        const userCollection = client.db("food_link_DB").collection("users");
        const charityRequestCollection = client.db("food_link_DB").collection("cherity-requests");
        const transactionCollection = client.db("food_link_DB").collection("transactions");
        const donationCollection = client.db("food_link_DB").collection("donations");
        const donationRequestCollection = client.db("food_link_DB").collection("donation-request");
        const reviewsCollection = client.db("food_link_DB").collection("review");
        const favouritesCollection = client.db("food_link_DB").collection("favourites");


        // jwt related apis
        // create jwt token 
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = await jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token });
        })
        // middleware for verify token in secret apis 
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized access' })
                }
                req.decoded = decoded
                next()
            });
        }

        // users related apis
        // get user role 
        app.get('/user-role/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const query = { email };
                const user = await userCollection.findOne(query);

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send(user);
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existUser = await userCollection.findOne(query);
            if (existUser) {
                return res.send({ message: 'User already exist in db' })
            } else {
                const result = await userCollection.insertOne(user);
                res.send(result)
            }
        })

        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        // set user role from admin
        app.patch('/set-role/:id', verifyToken, async (req, res) => {
            const userId = req.params.id;
            const { role } = req.body;
            if (!role) {
                return res.status(400).send({ message: 'Role is required' });
            }
            const filter = { _id: new ObjectId(userId) };
            const update = { $set: { role: role } };
            const result = await userCollection.updateOne(filter, update);

            res.send({
                message: 'update',
                result
            });
        });

        // delete user from admin
        app.delete('/delete-user/:id', verifyToken, async (req, res) => {
            const userId = req.params.id;
            const filter = { _id: new ObjectId(userId) };
            const result = await userCollection.deleteOne(filter);
            res.send({
                message: 'delete',
                result
            })
        })


        // donation related apis 
        // add donation by restaurant
        app.post('/add-donation', verifyToken, async (req, res) => {
            const donationInfo = req.body;
            const result = await donationCollection.insertOne(donationInfo);
            res.send({
                message: 'Success',
                result
            })
        })
        // get restaurant donations by id 
        app.get('/my-donation/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { userId: id };
            const result = await donationCollection.find(filter).toArray();
            res.send(result)
        })
        // delete donation 
        app.delete('/delete-donation/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await donationCollection.deleteOne(filter);
            res.send({
                message: 'deleted successfully',
                result
            })
        })

        // update donation -- restaurant
        // PATCH update donation
        app.patch('/update-donation/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const updateInfo = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    title: updateInfo.title,
                    foodType: updateInfo.foodType,
                    quantity: updateInfo.quantity,
                    pickupTime: updateInfo.pickupTime,
                    location: updateInfo.location,
                }
            };
            const result = await donationCollection.updateOne(filter, updateDoc);
            res.send({ modifiedCount: result.modifiedCount });
        });

        // get all donation by admin 
        app.get('/manage-donations', verifyToken, async (req, res) => {
            const result = await donationCollection.find().toArray();
            res.send(result)
        })
        app.patch('/manage-donation-status/:id', verifyToken, async (req, res) => {
            const donationId = req.params.id;
            const { status } = req.body;
            if (!['Verified', 'Rejected'].includes(status)) {
                return res.status(400).send({ message: 'Invalid status value' });
            }
            try {
                const filter = { _id: new ObjectId(donationId) };
                const updateDoc = {
                    $set: { status }
                };
                const result = await donationCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Donation not found' });
                }
                if (result.modifiedCount === 0) {
                    return res.send({ message: 'Status was already set' });
                }
                return res.send({ message: `${status} successfully`, success: true });
            } catch (error) {
                console.error('Error updating donation status:', error);
                return res.status(500).send({ message: 'Server error' });
            }
        });

        // get all verified dontaion 
        // Get all verified donations
        app.get('/donations/verified', async (req, res) => {
            const result = await donationCollection.find({ status: "Verified" }).toArray();
            res.send(result);
        });
        // donation details 
        app.get('/donation/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await donationCollection.findOne(filter);
            res.send(result)
        })


        // donation request 
        // add donation request api 
        app.post('/donation-request', verifyToken, async (req, res) => {
            const requestInfo = req.body;
            const result = await donationRequestCollection.insertOne(requestInfo);
            res.send({ success: true, result })
        })

        // get all donation data 
        app.get('/donation-requests', verifyToken, async (req, res) => {
            const result = await donationRequestCollection.find().toArray();
            res.send(result)
        })

        app.delete('/donation-request/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await donationRequestCollection.deleteOne(filter);
            res.send({ success: true, result })
        })


        // restaurant 
        app.get('/donation-requests-restaurant/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { restaurantEmail: email };
            const result = await donationRequestCollection.find(filter).toArray();
            res.send(result)
        });
        // request rejected 
        app.patch('/donation-request-reject/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            try {
                const filter = { _id: new ObjectId(id) };
                const update = { $set: { requestStatus: "Rejected" } };
                const result = await donationRequestCollection.updateOne(filter, update);
                res.send({ success: true, result });
            } catch (error) {
                console.error(error);
                res.send({ success: false, error: error.message });
            }
        });
        // request accepted 
        app.patch('/donation-request-accept/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const targetRequest = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
                if (!targetRequest) {
                    return res.status(404).send({ success: false, message: "Request not found" });
                }
                const donationId = targetRequest.donationId;
                await donationRequestCollection.updateOne({ _id: new ObjectId(id) }, { $set: { requestStatus: "Accepted" } });

                await donationRequestCollection.updateMany(
                    { donationId: donationId, _id: { $ne: new ObjectId(id) } },
                    { $set: { requestStatus: "Rejected" } }
                );
                await donationCollection.updateOne(
                    { _id: new ObjectId(donationId) }, { $set: { donationStatus: "Accepted" } }
                )
                res.send({ success: true, message: "Request accepted successfully" });
            } catch (error) {
                res.status(500).send({ success: false, message: "Server error" });
            }
        })
        // cherity 
        // get charity requests
        app.get('/my-requests-donation/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { charityEmail: email };
            const result = await donationRequestCollection.find(filter).toArray();
            res.send(result);
        })
        // get all accepted charity request 
        app.get('/my-request-pickups/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { charityEmail: email, requestStatus: "Accepted" };
            const result = await donationRequestCollection.find(filter).toArray();
            res.send(result);
        })
        /* pick up */
        app.patch('/pickup-status/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const targetRequest = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
            const donationId = targetRequest.donationId;
            const donationFilter = { _id: new ObjectId(donationId) };
            const donationUpdate = { $set: { donationStatus: "Picked Up" } }
            const updateDoc = {
                $set: {
                    pickedUpStatus: "Picked Up"
                }
            };
            await donationRequestCollection.updateOne(filter, updateDoc)
            await donationCollection.updateOne(donationFilter, donationUpdate)
            res.send({ success: true });
        })
        // get picked up donations 
        app.get('/pickup-donations/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { charityEmail: email, pickedUpStatus: "Picked Up" }
            const result = await donationRequestCollection.find(filter).toArray();
            res.send(result)
        })


        // delete request by charity  
        app.delete("/my-request-donation/:id", verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const result = await donationRequestCollection.deleteOne(filter);
                res.send({ success: false, result })
            } catch (error) {
                res.send({ success: false, error: error.message })
            }
        })



        // favourites and reviews
        // make favourite
        app.post('/favourite', async (req, res) => {
            const favoutiteInfo = req.body;
            const result = await favouritesCollection.insertOne(favoutiteInfo);
            res.send(result)
        })
        // check if favourite 
        app.get('/favourite-check', async (req, res) => {
            try {
                const { donationId, userEmail } = req.query;
                const result = await favouritesCollection.findOne({
                    donationId: donationId,
                    userEmail: userEmail
                });

                if (result) {
                    res.send({ favourite: true });
                } else {
                    res.send({ favourite: false });
                }
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Server error' });
            }
        });

        app.get('/favourites/:email', async (req, res) => {
            const email = req.params.email
            const query = { userEmail: email };
            const result = await favouritesCollection.find(query).toArray();
            res.send(result)
        });

        app.delete('/favourite-delete/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await favouritesCollection.deleteOne(filter);
            res.send({ result, success: true })
        })




        // payment related apis        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment --> request user for a cherity role
        app.post('/cherity-role-request', verifyToken, async (req, res) => {
            const paymentInfoCherity = req.body;
            const result = await charityRequestCollection.insertOne(paymentInfoCherity);
            res.send(result)
        })

        // save transaction to database
        app.post('/transactions', verifyToken, async (req, res) => {
            const transactions = req.body;
            const result = await transactionCollection.insertOne(transactions);
            res.send(result)
        })
        // get transaction by userId \
        app.get('/transaction/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { userId: id };
            const result = await transactionCollection.find(filter).toArray();
            res.send(result)
        })

        // gettting charity request status latest charity request return 
        app.get('/charity-request-status/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { userId: id };

            const result = await charityRequestCollection.findOne(
                filter,
                {
                    sort: { createdAt: -1 },
                    projection: { status: 1 }
                }
            );

            res.send(result);
        });


        // get all transaction request data admin
        app.get('/cherity-role-requests', verifyToken, async (req, res) => {
            const result = await charityRequestCollection.find().toArray();
            res.send(result)
        })

        // set charity role -- admin
        app.patch('/cherity-role-request/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const { action, userId } = req.query;
            let updateDoc = {};
            let userRoleUpdateResult = null;

            if (action === "Approved") {
                updateDoc = { $set: { status: "Approved" } };
            } else if (action === "Rejected") {
                updateDoc = { $set: { status: "Rejected" } };
            } else {
                return res.status(400).send({ message: "Invalid action (use Approved or Rejected)" });
            }

            try {
                const requestUpdateResult = await charityRequestCollection.updateOne(
                    { transactionId: id },
                    updateDoc
                );
                const transactionUpdateResult = await transactionCollection.updateOne(
                    { transactionId: id },
                    updateDoc
                );

                if (action === "Approved" && userId) {
                    userRoleUpdateResult = await userCollection.updateOne(
                        { _id: new ObjectId(userId) },
                        { $set: { role: 'charity' } }
                    );
                }

                res.send({
                    message: `${action}`,
                    requestUpdateResult,
                    transactionUpdateResult,
                    userRoleUpdateResult
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error", error });
            }
        });

        // set featured 
        app.patch('/donations-feature/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: { isFeatured: true, featuredAt: new Date() } };
            const result = await donationCollection.updateOne(filter, updateDoc);
            res.send({ success: true, result });
        });

        app.get('/donations-featured', async (req, res) => {
            const result = await donationCollection
                .find({ isFeatured: true })
                .sort({ featuredAt: -1 })
                .toArray();
            res.send(result);
        });

        // 


        // get latest 3 request for home page
        app.get('/charity-requests-latest', async (req, res) => {
            try {
                const latestRequests = await charityRequestCollection
                    .find({})
                    .sort({ createdAt: -1 })
                    .limit(3)
                    .toArray();

                res.send(latestRequests);
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });



        // add review 
        app.post("/add-reviews", verifyToken, async (req, res) => {
            const reviewInfo = req.body;
            const result = await reviewsCollection.insertOne(reviewInfo);
            res.send({ result })
        })
        
        // get the review
        app.get("/get-reviews/:id",async(req,res)=>{
            const id = req.params.id
            const filter = {
                donationId:id
            }
            const result = await reviewsCollection.find(filter).toArray()
            res.send(result)
        })
        // get review by email
        app.get("/get-review/:email",verifyToken, async(req,res)=>{
            const email = req.params.email;
            const filter = {reviewEmail: email}
            const result = await reviewsCollection.find(filter).toArray()
            res.send(result)
        })
        app.delete("/delete-review/:id",async(req,res)=>{
            const id = req.params.id
            const filter = {_id: new ObjectId(id)}
            const result = await reviewsCollection.deleteOne(filter)
            res.send({
                success:true,
                result})
        })





        app.get("/", (req, res) => {
            res.send("FoodLink server is running");
        });

        app.get("/home", (req, res) => {
            res.send("FoodLink server on home");
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (err) {
        console.error(err);
    } finally {
        // await client.close();
    }
}


run();
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
