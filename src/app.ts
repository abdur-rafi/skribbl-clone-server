import express from 'express';
import {createServer} from 'http';
import {Server , Socket} from 'socket.io';
import {localUrl, hostedUrl,roundTimer} from '../constants'
import {v4 as uuid} from 'uuid'
import {drawerImageData, sendImageData} from './socketEventsTypes'
import * as Room from './rooms'
const app = express();

const httpServer = createServer(app);


const io = new Server(httpServer , {
    cors : {
        origin : process.env.DEVELOPMENT ? hostedUrl : localUrl,
        methods : ['GET', 'POST']
    },
    transports : ['websocket']
});

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
}

function removeAPlayer(socket : Socket, roomId : string){
    const room = Room.roomMap[roomId];
    // room.members.delete(socket.id);
    deleteElement(room.members, socket.id);
    if(room.members.length){
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
        oldDrawer : oldDrawer
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
        if(members.length > 1){
            setTimeout(()=>{
                changeDrawer(room.drawer!, roomId);
            }, 10000);
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
}

function findEmptyRoom():string | null{
    let itr = Room.roomIdList.values();
    let roomId : string | null = null;
    for(let i = 0; i < Room.roomIdList.size; ++i){
        let val = itr.next().value;
        if(Room.roomMap[val] && Room.roomMap[val].members.length < 2){
            roomId = val;
        }
    }

    return roomId;
}

io.on('connection',(socket)=>{
    // console.log('connected');

    let roomId = findEmptyRoom();
    
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
    res.send('Well sdfdone!');
})

httpServer.listen(process.env.PORT || '3001', () => {
    console.log('The application is listening on port 3000!');
})