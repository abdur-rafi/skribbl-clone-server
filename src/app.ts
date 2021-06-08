import express from 'express';
import {createServer} from 'http';
import {Server} from 'socket.io';
import {localUrl, hostedUrl} from '../constants'
const app = express();

const httpServer = createServer(app);


const io = new Server(httpServer , {
    cors : {
        origin : process.env.DEVELOPMENT ? hostedUrl : localUrl,
        methods : ['GET', 'POST']
    }
});

io.on('connection',(socket)=>{
    console.log('connected');
    socket.join('testRoom');
    // socket.on('test', (data)=>{
    //     // console.log(data);
    //     io.to('testRoom').emit('test', data);
    // })
    socket.on('drawEvent',data=>{
        // console.log(data);
        socket.broadcast.to('testRoom').emit('drawEvent', data);
    })
})

app.get('/', (req, res) => {
    res.send('Well sdfdone!');
})

httpServer.listen(process.env.PORT || '3001', () => {
    console.log('The application is listening on port 3000!');
})