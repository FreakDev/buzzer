var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');

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
            saveGame()
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
        
        saveGame()

        if (displayClient)
            emitGame(displayClient)

        socket.emit('login-confirm', player)
    })

    socket.on('logout', function () {
        var plIndex = findPlayerBySocket(socket, true);

        if (plIndex !== -1) {
            game.players.splice(plIndex, 1)
            console.log(game)
            saveGame()
            emitGame(null)
        }
    });

    socket.on('tap-buzzer', function (uuid) {
        console.log('tap ', uuid, game.status)

        if (game.status === STATUS_LIST.PLAYING) {
            var player = findPlayer(uuid)
            console.log('player ', player)

            if (player && !player.penality) {
                game.status = STATUS_LIST.PAUSED
                game.activePlayer = player.uuid
                
                saveGame()
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
        if (consoleClient && socket.id !== consoleClient.id)
            return

        var player = findPlayer(game.activePlayer)
        if (player) {
            player.score++
            saveGame()

            emitGame(displayClient)
    
            console.log('good ', game)
            try {
                playersSocket[game.activePlayer].emit('score-update', player.score)    
            } catch(e) {}
        }
    })

    socket.on('console.bad-answer', function () {
        if (consoleClient && socket.id !== consoleClient.id)
            return

        var player = findPlayer(game.activePlayer)
        if (player) {
            player.penality = true
        }

        console.log('penality ', game)
        saveGame()
        try {
            playersSocket[game.activePlayer].emit('penality')
        } catch (e) {}
    })

    socket.on('console.reset-penality', function () {
        if (consoleClient && socket.id !== consoleClient.id)
            return

        game.players.forEach(pl => pl.penality = false)

        console.log('reset penality ', game)
        saveGame()
        socket.broadcast.emit('reset-penality')
    })

    socket.on('console.set-status', function (status) {
        if (consoleClient && socket.id !== consoleClient.id)
            return

        game.status = status
        if (status === STATUS_LIST.READY) {
            game.activePlayer = null
        }

        console.log('ready ', game)
        saveGame()
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

/* utils */
function findPlayer(uuid, onlyActive = true) {
    return game.players.find(pl => ( pl.active || !onlyActive ) && pl.uuid === uuid)
}

function findPlayerBySocket(socket, returnIndex = false) {
    plUuid = Object.keys(playersSocket).find(uuid => socket.id === playersSocket[uuid].id)
    let fn = returnIndex ? 'findIndex' : 'find'

    let result = game.players[fn](pl => pl.uuid === plUuid)

    return result
}

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

function saveGame() {
    fs.writeFile('game.json', JSON.stringify(game), 'utf8', function() {})
}

function restaureGame() {
    try {
        data = fs.readFileSync('game.json', 'utf8')
        game = JSON.parse(data)
        console.log('restaure game ', game)
    } catch (e) {
        console.log(e)
    }
}

restaureGame()

http.listen(3000, function(){
    console.log('listening on *:3000');
});