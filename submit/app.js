const express = require('express');
const app = express();
const path = require('path'); // Used for concatenation to create a path
const fs = require("fs").promises;
require('dotenv').config();
const axios = require('axios');
const amqp = require("amqplib") // Documentation here: https://www.npmjs.com/package/amqp
const cors = require('cors');
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const YAML = require('yamljs');
const staticFiles = path.join(__dirname, '/public');

app.use(cors()); // Use cors to allow cross origin requests.
app.use(express.static(staticFiles));
app.use(express.json());

const APP_PRODUCER_PORT = process.env.SUB_PORT || 3200  // Provide default if env var isn't there for some reason
const RMQ_PRODUCER_PORT = process.env.RMQ_PORT || 5672
const RMQ_USERNAME = process.env.RMQ_USERNAME || "admin"
const RMQ_PASSWORD = process.env.RMQ_PASSWORD || "admin"
const RMQ_HOST = process.env.RMQ_HOST || "localhost"
const QUEUE_NAME = process.env.SUB_QUEUE_NAME || "SUBMITTED_JOKES"
const RMQ_URL = `amqp://${RMQ_USERNAME}:${RMQ_PASSWORD}@${RMQ_HOST}:${RMQ_PRODUCER_PORT}/`;

let gConnection;
let gChannel;

// ================================ Routing ==============================================

// Serve Swagger compliant documentation at tge /docs route.
app.use("/docs", swaggerUi.serve, swaggerUi.setup(YAML.load(path.join(__dirname, 'OpenAPISpec.yaml'))));

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

app.post("/sub", async (req,res) => {
    try {
        await sendJoke(gChannel, req.body)
        res.sendStatus(201)
    } catch (err) {
        res.status(500).send(err)
    }
});

// Catch all unexpected routes
app.get('*', async (req,res) => {
  res.status(404).sendFile(path.join(staticFiles, '404.html'));
});

const server = app.listen(APP_PRODUCER_PORT, () => console.log(`Listening on port ${APP_PRODUCER_PORT}`));

// ================================ Methods ==============================================

// Connect to RabbitMQ.
async function createConnection(conStr) {
  try {
      const connection = await amqp.connect(conStr)    // Create connection
      console.log(`Connected to rabbitmq using ${conStr}`)

      const channel = await connection.createChannel()    // Create channel. Channel can have multiple queues
      console.log(`Channel created`)

      return { connection, channel }

  } catch (err) {
      console.log(`Failed to connect to queue in createConection function`)
      return false;
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

// Adds a joke to the queue.
async function sendJoke(channel, joke) {
  try {
    const res = await channel.assertQueue(QUEUE_NAME, {durable: true})    // Create queue called whatever is in category if one doesn't exist
    console.log(`${QUEUE_NAME} queue created / accessed`)
    await channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(joke)), { persistent: true }) // Saves to volume to survive broker restart
  } catch (err) {
    console.log(`Failed to write to ${QUEUE_NAME} queue. ${err}`)
  }
}

async function connectToRabbitMQ() {
  let connected;
  while (!connected) {
    const url = RMQ_URL;
    const result = await createConnection(url);

    if (result) {

    if (result) {
      connected = true;
      gConnection = result.connection;
      gChannel = result.channel;
      return;
    }
    } else {
      // Retry connecting to the next URL after 3 seconds
      console.log(`Retrying connection to RabbitMQ service at ${RMQ_URL} in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

connectToRabbitMQ();
