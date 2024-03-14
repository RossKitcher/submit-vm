const express = require('express');
const app = express();
const path = require('path'); // Used for concatenation to create a path
const fs = require("fs").promises;
const mysql = require("mysql2");
require('dotenv').config();
const axios = require('axios');
const amqp = require("amqplib") // Documentation here: https://www.npmjs.com/package/amqp
const cors = require('cors');
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

// Swagger definition
const swaggerOptions = {
  swaggerDefinition: {
    info: {
      title: "Submit Microservice Documenation",
      version: "1.0.0",
      description: "Microservice to submit new jokes to the system.",
    },
  },
  apis: ["./app.js"]
}

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(cors());
app.use(express.static((path.join(__dirname, '/public'))));
app.use(express.json());

const APP_PRODUCER_PORT = process.env.SUB_PORT || 3200  // Provide default if env var isn't there for some reason
const RMQ_PRODUCER_PORT = process.env.RMQ_PORT || 5672
const RMQ_USERNAME = process.env.RMQ_USERNAME || "admin"
const RMQ_PASSWORD = process.env.RMQ_PASSWORD || "admin"
const RMQ_HOST = process.env.RMQ_HOST || "localhost"
const QUEUE_NAME = process.env.SUB_QUEUE_NAME || "SUBMITTED_JOKES"

let gConnection;
let gChannel;

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /sub/types:
 *   get:
 *     summary: Get all joke types.
 *     description: Gets joke types from the MySQL database. If the database is inaccessible, then the most recent types backup is returned.
 *     responses:
 *       200:
 *         description: Successful request.
 *       500:
 *         description: Internal server error.
 */
app.get("/types", async (req, res) => {
    let APIEndPoint = "http://10.0.0.5:4000/types";

    axios.get(APIEndPoint)
        .then((response) => {
            fs.writeFile('/var/backups/app/types.txt', JSON.stringify(response.data));
            res.send(response.data);
        })
        .catch((err) => {
            fs.readFile('/var/backups/app/types.txt')
              .then(fsRes => {
                res.send(JSON.parse(fsRes));
              }) 
              .catch(parseError => {
                res.status(500).send(parseError);
              })            
        });

});

/**
 * @swagger
 * /sub/sub:
 *   post:
 *     summary: Submit a new joke to the system.
 *     description: Expects parameters in the request body named type, setup and punchline.
 *     responses:
 *       202:
 *         description: Successful response.
 *       500:
 *         description: Internal server error.
 */
app.post("/sub", async (req,res) => {
    try {
        await sendJoke(gChannel, req.body)
        res.sendStatus(201)
    } catch (err) {
        res.status(500).send(err)
    }
});

const server = app.listen(APP_PRODUCER_PORT, () => console.log(`Listening on port ${APP_PRODUCER_PORT}`));

async function createConnection(conStr) {
    try {
        const connection = await amqp.connect(conStr)    // Create connection
        console.log(`Connected to rabbitmq using ${conStr}`)

        const channel = await connection.createChannel()    // Create channel. Channel can have multiple queues
        console.log(`Channel created`)

        return { connection, channel }

    } catch (err) {
        console.log(`Failed to connect to queue in createConection function`)
        throw err
    }
}

// If needed, this is a function to close the queue connections
async function closeConnection(connection, channel) {
    try {
        await channel.close()
        await connection.close()
        console.log(`Connection and channel closed`)
    } catch (err) {
        console.log(`Failed to close connection. ${err}`)
    }
}

  // This function writes one json message to the queue based on the msg.category property
  async function sendJoke(channel, joke) {
    try {
      const res = await channel.assertQueue(QUEUE_NAME, {durable: true})    // Create queue called whatever is in category if one doesn't exist
      console.log(`${QUEUE_NAME} queue created / accessed`)
      await channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(joke)), { persistent: true }) // Saves to volume to survive broker restart
    } catch (err) {
      console.log(`Failed to write to ${QUEUE_NAME} queue. ${err}`)
    }
  }


  // To use await on createConnection, it needs to be called from within an async function
// Created an Immediately-Invoked Function Expression (IIFE) function to do this
// This is a function that is immediately invoked after declaration
// syntax is:
// ( function() {
// })()
(async () => {
    const conStr = `amqp://${RMQ_USERNAME}:${RMQ_PASSWORD}@${RMQ_HOST}:${RMQ_PRODUCER_PORT}/`
    try {
      console.log(`Trying to connect to RabbitMQ at ${RMQ_HOST}:${RMQ_PRODUCER_PORT}`) // Only give this level of detail away in testing
      const rmq = await createConnection(conStr) // amqplib is promise based so need to initialise it in a function as await only works in an async function
      gConnection = rmq.connection  // Globally available in the file for other functions to use if needed
      gChannel = rmq.channel
    }
    catch (err) {
      console.log(err.message)
      if (gConnection) {
        closeConnection(gConnection, gChannel)
        console.log(`Closing connections`)
      }
      throw err  // kill the app
    }
  })().catch((err) => { 
    console.log(`Shutting down node server listening on port ${APP_PRODUCER_PORT}`)
    server.close()   // Close the http server created with app.listen
    process.exit(1)  // A non-zero exit will cause the container to stop - depending on restart policy, it docker may try to restart it
  }) // () means call it now
  
  
