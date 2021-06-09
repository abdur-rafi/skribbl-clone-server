export type player = {
    socketId : string,
    userName : string
}

export type room = {
   members : [string],
   drawer : string | null,
   startingTIme : number,
}

export interface gameRooms {
   [key : string] : room 
}

export interface roomIdToSocketMap{
    [key : string] : string
}

interface roomCount {
    count : number
}

export let roomCount : roomCount  = {
    count : 0
};

export let roomIdList = new Set<string>();

export let roomMap : gameRooms = {

};

export let socketToRoomIdMap : roomIdToSocketMap = {

}