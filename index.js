var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var uuid = require('uuid/v4');

app.use('/', express.static('client'))


const STATUS_LIST = {
    'INTRO': 'INTRO',
    'PAUSED': 'PAUSED', 
    'READY': 'READY',
    'PLAYING': 'PLAYING',
}

var game = {
    status: STATUS_LIST.INTRO,
    activePlayer: null,
    players: []
}

playersSocket = {}

var consoleClient = null
var displayClient = null

io.on('connection', function(socket){

    /* generic */
    socket.on('disconnect', function () {
        var plIndex = findPlayerBySocket(socket, true);

        if (plIndex !== -1) {
            game.players[plIndex].active = false
        } else if (consoleClient && consoleClient.id === socket.id) {
            consoleClient = null
        } else if (displayClient && displayClient.id === socket.id) {
            displayClient = null
        }
    });



    /* client */
    socket.on('login', function (newPlayer) {
        var player = null


        if (newPlayer.uuid) {
            player = findPlayer(newPlayer.uuid, false)
        }

        if (!player) {
            // @todo check duplicate nickname
            newPlayer.uuid = uuid()
            game.players.push(newPlayer)
            player = newPlayer
            player.score = 0
        }

        player.active = true
        playersSocket[player.uuid] = socket

        console.log(game)

        socket.emit('login-confirm', { nickname: player.nickname, uuid: player.uuid })
    })
    socket.on('tap-buzzer', function (uuid) {
        if (game.status === STATUS_LIST.PLAYING) {
            game.status = STATUS_LIST.PAUSED
            game.activePlayer = findPlayer(uuid)
            emitGame(displayClient)
            emitGame(consoleClient)
        }
    })


    /* console */
    socket.on('console.init', function () {
        if (!consoleClient) {
            consoleClient = socket
        } else {
            return null
        }
    })

    socket.on('console.good-answer', function (uuid) {
        game.activePlayer.score++
        emitGame(displayClient)
        emitGame(consoleClient)
        playersSocket[game.activePlayer.uuid].emit('score-update', game.activePlayer.score)
    })

    socket.on('console.set-status', function (uuid, status) {
        game.status = status
        emitGame(displayClient)
        emitGame(consoleClient)
    })

    /* display */
    socket.on('display.init', function () {
        if (!displayClient) {
            displayClient = socket
            emitGame(displayClient)
        } else {
            return null
        }        
    })

});

function findPlayer(uuid, onlyActive = true) {
    return game.players.find(pl => ( pl.active || !onlyActive ) && pl.uuid === uuid)
}

function findPlayerBySocket(socket, returnIndex = false) {
    plUuid = Object.keys(playersSocket).find(uuid => socket.id === playersSocket[uuid].id)
    let fn = returnIndex ? 'findIndex' : 'find'

    let result = game.players[fn](pl => pl.uuid === plUuid)

    return result
}

/* utils */
function emitGame(client) {
    try {
        client.emit('game', game)
    } catch (e) {
        console.log('ERROR : ', e)
    }
}


http.listen(3000, function(){
    console.log('listening on *:3000');
});