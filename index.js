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
            if (game.players.find(pl => pl.nickname.toLowerCase() === newPlayer.nickname.toLowerCase())) {
                socket.emit('login-fail', 'ce pseudo est déjà pris')
                return
            }
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
        console.log('tap ', uuid, game.status)

        if (game.status === STATUS_LIST.PLAYING) {
            game.status = STATUS_LIST.PAUSED
            var player = findPlayer(uuid)
            console.log('player ', player)

            if (player && !player.penality) {
                game.activePlayer = player.uuid
                emitGame(null)    
            }
        }
    })


    /* console */
    socket.on('console.init', function () {
        if (!consoleClient) {
            consoleClient = socket
            emitGame(consoleClient)
        } else {
            return null
        }
    })

    socket.on('console.good-answer', function () {
        if (socket.id !== consoleClient.id)
            return

        var player = findPlayer(game.activePlayer)
        if (player) {
            player.score++
            emitGame(displayClient)
    
            console.log('good ', game)
    
            playersSocket[game.activePlayer].emit('score-update', player.score)    
        }
    })

    socket.on('console.bad-answer', function () {
        if (socket.id !== consoleClient.id)
            return

        var player = findPlayer(game.activePlayer)
        if (player) {
            player.penality = true
        }

        console.log('penality ', game)
        playersSocket[game.activePlayer].emit('penality')
    })

    socket.on('console.reset-penality', function () {
        if (socket.id !== consoleClient.id)
            return

        game.players.forEach(pl => pl.penality = false)

        console.log('reset penality ', game)
        socket.broadcast.emit('reset-penality')
    })

    socket.on('console.set-status', function (status) {
        if (socket.id !== consoleClient.id)
            return

        game.status = status
        if (status === STATUS_LIST.READY) {
            game.activePlayer = null
        }

        console.log('ready ', game)
        emitGame(null)
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
        if (client === null) {
            io.emit('game', game)
        } else {
            client.emit('game', game)
        }
    } catch (e) {
        console.log('ERROR : ', e)
    }
}


http.listen(3000, function(){
    console.log('listening on *:3000');
});