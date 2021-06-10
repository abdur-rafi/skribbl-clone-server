import express from 'express';
import {createServer} from 'http';
import {Server , Socket} from 'socket.io';
import {localUrl, hostedUrl} from '../constants'
import {v4 as uuid} from 'uuid'
import {drawerImageData, sendImageData} from './socketEventsTypes'
import * as Room from './rooms'
const app = express();

const roundTimer = 100000;
const maxPlayerInRoom = 4;

const httpServer = createServer(app);


const io = new Server(httpServer , {
    cors : {
        origin : process.env.DEVELOPMENT ? hostedUrl : localUrl,
        methods : ['GET', 'POST']
    },
    transports : ['websocket']
});

function emitPlayers(roomId : string){
    const members = Room.roomMap[roomId].members;
    io.in(roomId).emit('updatePlayers', {
        players : members.map(m =>{
            return Room.socketToInfoMap[m]
        })
    });
}

function emitDrawer(d : string, roomId : string){
    io.in(roomId).emit('updateDrawer', {
        drawer : Room.socketToInfoMap[d]
    })
}
// console.log(uuid());

function createNewRoom(socket : Socket){
    const newRoomId = uuid();   
    Room.roomIdList.add(newRoomId);
    Room.roomMap[newRoomId] = {
        members : [socket.id],
        drawer : socket.id,
        startingTIme : Date.now()
    }
    Room.socketToRoomIdMap[socket.id] = newRoomId;
    socket.join(newRoomId);
    Room.roomCount['count'] += 1;
    emitPlayers(newRoomId);
}

function removeAPlayer(socket : Socket, roomId : string){
    const room = Room.roomMap[roomId];
    // room.members.delete(socket.id);
    deleteElement(room.members, socket.id);
    if(room.members.length){
        emitPlayers(roomId);
        if(room.drawer === socket.id){
            let f = room.members.values().next();
            room.drawer = f.value;
            room.startingTIme = Date.now();
        }
    }
    else{
        Room.roomCount['count'] -= 1;
        Room.roomIdList.delete(roomId);
        delete Room.roomMap[roomId];
    }
}

function sendImageData(d : sendImageData){
    return d;
}

function deleteElement(arr : [any] , val : any){
    arr.splice(arr.indexOf(val), 1);
}

function changeDrawerSocketEvent(oldDrawer : string , newDrawer : string){
    io.to(oldDrawer).emit('newDrawer',{
        newDrawer : newDrawer
    })
    io.to(newDrawer).emit('selfDrawer',{
        oldDrawer : oldDrawer,
        newDrawer : newDrawer
    })
    
}

function changeDrawer(socketId : string, roomId : string){
    try{
        console.log( 'in room' +  roomId);
        const room = Room.roomMap[roomId];
        const members = room.members;
        deleteElement(members, socketId);
        members.push(socketId);
        room.drawer = members[0];
        // Room.roomMap[roomId].drawer = Room.roomMap[roomId].members[0];
        changeDrawerSocketEvent(socketId, members[0]);
        emitDrawer(room.drawer, roomId);
        if(members.length > 1){
            setTimeout(()=>{
                changeDrawer(room.drawer!, roomId);
            }, roundTimer);
        }
    }
    catch(err){
        console.log(err);
    }
}

function addToRoom(socket : Socket, roomId : string){
    if(Room.roomMap[roomId].members.length === 1){
        console.log('setting timer for : ' + roomId);
        setTimeout(()=>{
            changeDrawer(socket.id, roomId);
        }, 1);
    }
    console.log(roomId);
    socket.join(roomId);
    Room.roomMap[roomId].members.push(socket.id);
    Room.socketToRoomIdMap[socket.id] = roomId;
    io.to(Room.roomMap[roomId].drawer!).emit('sendImageData', sendImageData({
        to : socket.id
    }));
    emitPlayers(roomId);
}

function findEmptyRoom():string | null{
    let itr = Room.roomIdList.values();
    let roomId : string | null = null;
    console.log(maxPlayerInRoom);
    for(let i = 0; i < Room.roomIdList.size; ++i){
        let val = itr.next().value;
        if(Room.roomMap[val] && Room.roomMap[val].members.length < maxPlayerInRoom ){
            roomId = val;
        }
    }

    return roomId;
}

io.on('connection',(socket)=>{
    console.log(socket.handshake.query.userName);
    // console.log('connected');

    let roomId = findEmptyRoom();

    Room.socketToInfoMap[socket.id] = {
        socketId : socket.id,
        userName : socket.handshake.query.userName as string
    }
    if(!roomId){
        console.log('creating room');
        createNewRoom(socket);
    }
    else{
        console.log('adding to room');
        addToRoom(socket, roomId);
    }   

    socket.on('drawerImageData', (data : drawerImageData)=>{
        if(Room.roomMap[Room.socketToRoomIdMap[socket.id]].members.some( id => id === data.to)){
            io.to(data.to).emit('drawerImageData', data);
        }
    })

    socket.on('message', data=>{
        const roomId = Room.socketToRoomIdMap[socket.id];
        if(roomId){
            io.in(roomId).emit('message', {
                message : data.message, 
                sender : Room.socketToInfoMap[socket.id]
            })
        }
    })

    socket.on('disconnect',()=>{
        console.log('disconnected');
        const roomId = Room.socketToRoomIdMap[socket.id];
        if(Room.roomMap[roomId]){
            console.log('removing player');
            removeAPlayer(socket, roomId);
        }
    })
    
    // socket.join('testRoom');
    socket.on('drawEvent',data=>{
        if(Room.roomMap[Room.socketToRoomIdMap[socket.id]].drawer === socket.id)
            socket.broadcast.to(Room.socketToRoomIdMap[socket.id]).emit('drawEvent', data);
    })
})

app.get('/', (req, res) => {
    res.send('Well done!');
})

httpServer.listen(process.env.PORT || '3001', () => {
    console.log('The application is listening on port 3000!');
})