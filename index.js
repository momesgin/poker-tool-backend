const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
// const redis = require('redis');
const cors = require('cors');
const bodyParser = require('body-parser');

const { handleUserConnect, checkRoom } = require('./modules/api');

let origin;

if (process.env.NODE_ENV === 'production') {
  origin = 'http://146.190.150.213:80';
} else {
  origin = 'http://localhost:4000';
}

// express init
const app = express();

// setup cors and body-parser
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const httpServer = createServer(app);

// setup redis
// const redisClient = redis.createClient(6379, '127.0.0.1');

// Connect to redis server
// (async () => {
//   await redisClient.connect();
// })();

// redisClient.on('connect', () => {
//   console.log('REDIS Connected!');

//   const io = new Server(httpServer, {
//     cors: {
//       origin: 'http://localhost:4000',
//       methods: ['GET', 'POST'],
//     },
//   });

//   io.on('connection', (socket) => {
//     handleUserConnect(socket, io, redisClient);
//   });
// });

// init socketio
const io = new Server(httpServer, {
  cors: {
    origin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  handleUserConnect(socket, io);
});

// check session id
app.post('/api/checkRoom', (req, res) => {
  const { room } = req.body;
  const session = checkRoom(room);
  res.send(session);
});

httpServer.listen(8080, () => {
  console.log('Server is running...');
});
