"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var constants_1 = require("../constants");
var app = express_1.default();
var httpServer = http_1.createServer(app);
var io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.DEVELOPMENT ? constants_1.hostedUrl : constants_1.localUrl,
        methods: ['GET', 'POST']
    }
});
io.on('connection', function (socket) {
    console.log('connected');
    socket.join('testRoom');
    // socket.on('test', (data)=>{
    //     // console.log(data);
    //     io.to('testRoom').emit('test', data);
    // })
    socket.on('drawEvent', function (data) {
        // console.log(data);
        socket.broadcast.to('testRoom').emit('drawEvent', data);
    });
});
app.get('/', function (req, res) {
    res.send('Well sdfdone!');
});
httpServer.listen(process.env.PORT || '3001', function () {
    console.log('The application is listening on port 3000!');
});
