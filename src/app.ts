import express from 'express';
import {createServer} from 'http';
import {Server , Socket} from 'socket.io';
import {localUrl, hostedUrl} from '../constants'
import {v4 as uuid} from 'uuid'
import {drawerImageData, sendImageData} from './socketEventsTypes'
import * as Room from './rooms'
const app = express();

const roundTimer = 20000;
const maxPlayerInRoom = 10;
const timeDelay = 7000;

const httpServer = createServer(app);

const words = ['octopus', 'buet', 'cse', 'genius', 'psa', 'legend']

function getRandomWord():string{
    return words[Math.floor(Math.random() * (words.length - 1))];
}


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
        members : members
    });
}

function emitDrawer(d : string, roomId : string){
    io.in(roomId).emit('updateDrawer', {
        drawer : Room.socketToInfoMap[d]
    })
}
// console.log(uuid());

function createNewRoom(socket : Socket, userName : string){
    const newRoomId = uuid();   
    Room.roomIdList.add(newRoomId);
    Room.roomMap[newRoomId] = {
        members : [{ socketId : socket.id,userName : userName, score : 0, hasGuessed : false, turnScore : 0,}],
        drawer : socket.id,
        startingTIme : Date.now(),
        word : null,
        turnId : null,
        guessedCount : 0,
        round : 0,
        maxRounds : 3
    }
    Room.socketToRoomIdMap[socket.id] = newRoomId;
    socket.join(newRoomId);
    Room.roomCount['count'] += 1;
    emitPlayers(newRoomId);
}



function removeAPlayer(socket : Socket, roomId : string){
    const room = Room.roomMap[roomId];
    // room.members.delete(socket.id);
    // deleteElement(room.members, socket.id);
    deleteUsingComp(room.members, {socketId : socket.id},groupMemberComp);
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
    delete Room.wordsGiven[oldDrawer];
    const room = Room.roomMap[Room.socketToRoomIdMap[newDrawer]];
    
    io.to(Room.socketToRoomIdMap[oldDrawer]).emit('turnEnd',{
        members : room.members
    });
    setTimeout(()=>{
        io.to(Room.socketToRoomIdMap[oldDrawer]).emit('newDrawer',{
            newDrawer : newDrawer,
            userName : Room.socketToInfoMap[newDrawer].userName
        })
        let words = [getRandomWord(), getRandomWord(),getRandomWord()];
        io.to(newDrawer).emit('selfDrawer',{
            oldDrawer : oldDrawer,
            newDrawer : newDrawer,
            words : words
        })
        Room.wordsGiven[newDrawer] = words;
        setTimeout(()=>{
            if(!room.word){
                room.word = words[0];
                room.startingTIme = Date.now();
                io.to(newDrawer).emit('chosenWord',{
                    word : words[0]
                })
                
                if(room.members.length > 1){
                    io.to(Room.roomMap[Room.socketToRoomIdMap[newDrawer]].members.filter(id => id.socketId != newDrawer).map(m => m.socketId))
                    .emit('chosenWordLenght',{
                        length : words[0].length
                    })
                }
                
                io.to(Room.socketToRoomIdMap[newDrawer]).emit('setTimer', {
                    time : roundTimer
                })
    
                setChangeDrawerCallback( Room.socketToRoomIdMap[newDrawer], roundTimer);
            }
        }, timeDelay);
    }, 4000);
    
    
}

function deleteUsingComp(arr : any[], elem : any, comp : (a : any, b : any) => boolean){
    let di = getIndex(arr, elem, comp);
    if(di != -1){
        arr.splice(di, 1);
    }
}

function getIndex(arr : any[], elem : any, comp : (a : any, b : any) => boolean) : number{
    for(let i = 0; i < arr.length; ++i){
        if(comp(arr[i], elem)){
            return i;
        }
    }
    return -1;
}

function groupMemberComp(a : any, b : any){
    return a.socketId === b.socketId;
}

function resetMembers(room:Room.room){
    room.members.forEach(m=>{
        m.hasGuessed=false;
        m.turnScore = 0;
    });
}

function emitResults(){

}

function changeDrawer(socketId : string | null, roomId : string, turnId : string){
    try{
        const room = Room.roomMap[roomId];
        if(turnId != room.turnId){
            return;
        }
        const members = room.members;
        if(members.length === 1){
            return;
        }
        
        room.word = null;
        let index : number;
        if(socketId === null){
            index = members.length;
            room.round = 1;
        }
        else
            index = getIndex(room.members, {socketId : socketId}, groupMemberComp);
        if(index == 0){
            index = members.length;
            if(room.round === room.maxRounds){
                room.drawer = null;
                room.guessedCount = 0;
                room.round = 0;
                room.turnId = null;
                room.startingTIme = 0;
                io.to(roomId).emit('endGame', {
                    members : members
                })
                setChangeDrawerCallback(roomId, 10000);
                return;
            }
            io.to(roomId).emit('roundNumber', {
                round : room.round
            })
            room.round++;
        }
        room.drawer = members[(index - 1) % members.length].socketId;
        room.guessedCount = 0;
        changeDrawerSocketEvent(socketId!, room.drawer);
        resetMembers(room);
    }
    catch(err){
        console.log(err);
    }
}

function addToRoom(socket : Socket, roomId : string, userName : string){
    socket.join(roomId);
    const room = Room.roomMap[roomId];
    room.members.push({ socketId : socket.id, userName : userName, score : 0, hasGuessed : false, turnScore : 0});
    Room.socketToRoomIdMap[socket.id] = roomId;
    if(room.members.length === 2){
        setChangeDrawerCallback(roomId, 1);
    }
    else{
        io.to(room.drawer!).emit('sendImageData', sendImageData({
            to : socket.id
        }));
        io.to(socket.id).emit('round', {
            round : room.round
        })
        io.to(socket.id).emit('setTimer',{
            time : Date.now() - room.startingTIme
        })
        if(room.word){
            io.to(socket.id).emit('chosenWordLenght',{
                length : room.word.length
            })
        }
        emitPlayers(roomId);

    }
}

function findEmptyRoom():string | null{
    let itr = Room.roomIdList.values();
    let roomId : string | null = null;
    // console.log(maxPlayerInRoom);
    for(let i = 0; i < Room.roomIdList.size; ++i){
        let val = itr.next().value;
        if(Room.roomMap[val] && Room.roomMap[val].members.length < maxPlayerInRoom ){
            roomId = val;
        }
    }

    return roomId;
}

function setChangeDrawerCallback(roomId : string, time : number){
    const room = Room.roomMap[roomId];
    if(!room){
        console.log("room is undefinded in setChangeDrawerCallback");
        return;
    }
    let turnId = uuid();
    room.turnId = turnId;
    if(room.members.length > 1){
        setTimeout(()=>{
            changeDrawer(room.drawer, roomId, turnId);
        }, time);
    }
}

io.on('connection',(socket)=>{
    // console.log(socket.handshake.query.userName);
    // console.log('connected');

    let roomId = findEmptyRoom();

    let userName = socket.handshake.query.userName as string;

    Room.socketToInfoMap[socket.id] = {
        socketId : socket.id,
        userName : userName
    }
    if(!roomId){
        console.log('creating room');
        createNewRoom(socket, userName);
    }
    else{
        console.log('adding to room');
        addToRoom(socket, roomId, userName);
    }   

    socket.on('drawerImageData', (data : drawerImageData)=>{
        if(Room.roomMap[Room.socketToRoomIdMap[socket.id]].members.some( m => m.socketId === data.to)){
            io.to(data.to).emit('drawerImageData', data);
        }
    })

    socket.on('message', data=>{
        const roomId = Room.socketToRoomIdMap[socket.id];
        if(roomId){
            const room = Room.roomMap[roomId];
            const word = room.word;
            if(data.message === word && room.drawer !== socket.id){
                for (let i = 0; i < room.members.length ; ++i){
                    if(room.members[i].socketId === socket.id){
                        if(room.members[i].hasGuessed)
                            break;
                        room.members[i].score += 10;
                        room.members[i].turnScore = 10;
                        room.members[i].hasGuessed = true;
                        data.message = 'guessed correctly'
                        room.guessedCount += 1;
                        if(room.guessedCount < 2){
                            let timeDelta = Date.now() - room.startingTIme;
                            let gap = roundTimer - timeDelta;
                            setChangeDrawerCallback(roomId, gap / 2);
                            io.to(roomId).emit('setTimer', {
                                time : gap / 2
                            })
                        }
                        // emitPlayers(roomId);
                        break;
                    }
                }
            }
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

    socket.on('chosenWord', data=>{
        console.log(data);
        
        const room = Room.roomMap[Room.socketToRoomIdMap[socket.id]];
        if(room.drawer === socket.id && room.word === null && 
            Room.wordsGiven[socket.id].some(word => word === data.word)){
            console.log('here');
            room.startingTIme = Date.now();
            room.word = data.word;
            delete Room.wordsGiven[socket.id];
            io.to(socket.id).emit('chosenWord',{
                word : data.word
            })
            socket.broadcast.to(Room.socketToRoomIdMap[socket.id]).emit('chosenWordLenght',{
                length : data.word.length
            })
            io.to(Room.socketToRoomIdMap[socket.id]).emit('setTimer', {
                time : roundTimer
            })
            setChangeDrawerCallback(Room.socketToRoomIdMap[socket.id], roundTimer);
            // if(room.members.length > 1){
            //     let turnId = uuid();
            //     room.turnId = turnId;
            //     setTimeout(()=>{
            //         changeDrawer(room.drawer!, Room.socketToRoomIdMap[socket.id], turnId);
            //     }, roundTimer);
            // }
        }
    })
})

app.get('/', (req, res) => {
    res.send('Well done!');
})

httpServer.listen(process.env.PORT || '3001', () => {
    console.log('The application is listening ');
})