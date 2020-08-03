const fs = require('fs');
const http = require('http');
const url = require('url');

/*
    Utilities
*/

// https://stackoverflow.com/a/3409200
function parseCookies(req) {
    var list = {};
    var rc = req.headers.cookie;
    rc && rc.split(';').forEach(function( cookie ) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}

// https://stackoverflow.com/a/2117523
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// https://stackoverflow.com/a/728694
function clone(obj) {
    var copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

/*
    libmlcard
*/
const ffi = require("@saleae/ffi");
var libmlcard = ffi.Library("resources/libmlcard", {
    init: ["void", []],
    alloc_game: ["pointer", []],
    alloc_model: ["pointer", ["string"]],
    free_game: ["void", ["pointer"]],
    free_model: ["void", ["pointer"]],
    serialize_game: ["string", ["pointer"]],
    take_action: ["void", ["pointer", "int"]],
    ai_take_action: ["int", ["pointer", "pointer"]],
});

libmlcard.init();

/*
    Game management
*/

function Game() {
    this.game = libmlcard.alloc_game();
    this.state = JSON.parse(libmlcard.serialize_game(this.game));
    this.players = [];
}
Game.prototype.get_player = function(client_id) {
    for (var i = 0; i < this.players.length; i++) {
        if (this.players[i].client_id == client_id) {
            return this.players[i];
        }
    }
    return null;
};
Game.prototype.join = function(client_id, player_id) {
    for (var i = 0; i < this.players.length; i++) {
        if (this.players[i].id == player_id) {
            return (this.players[i].client_id == client_id);
        }
    }
    this.players.push({
        id: player_id,
        client_id: client_id
    });
};
Game.prototype.get_state = function(client_id) {
    var player = this.get_player(client_id);

    var state = clone(this.state);
    if (player == null || player.id != state.current_player) {
        delete state.actions;
    }
    if (player == null || player.id != "player1") {
        delete state.player1.cards;
    }
    if (player == null || player.id != "player2") {
        delete state.player2.cards;
    }

    return state;
};
Game.prototype.play = function(client_id, play) {
    var player = this.get_player(client_id);

    if (player.id != this.state.current_player) {
        return false;
    }

    libmlcard.take_action(this.game, play);    
    this.state = JSON.parse(libmlcard.serialize_game(this.game));

    return true;
};

function Games() {
    this.games = {};
}
Games.prototype.create = function(id) {
    if (this.games[id] != null) {
        return false;
    }
    this.games[id] = new Game();
    return true;
};
Games.prototype.is_valid = function(id) {
    return this.games[id] != null;
};
Games.prototype.get = function(id) {
    return this.games[id];
};
var games = new Games();

/*
var trained_model = fs.readFileSync('resources/model.json');
var ai1 = libmlcard.alloc_model(trained_model);
var ai2 = libmlcard.alloc_model(trained_model);

while (true) {
    var game_state = JSON.parse(libmlcard.serialize_game(game));
    console.log(game_state);

    if ((game_state.player1.health <= 0) ||
        (game_state.player2.health <= 0))
    {
        console.log("Winner:" + game_state.current_player);
        break;
    }
    
    if (game_state.current_player == "player1") {
        var ai_action = libmlcard.ai_take_action(game, ai1);
        console.log(ai_action);
    } else if (game_state.current_player == "player2") {
        var ai_action = libmlcard.ai_take_action(game, ai2);
        console.log(ai_action);
    }
}
*/

function return_invalid_params(res) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.write(`{ "error" : "invalid parameters" }`);
    res.end(); 
}

function return_game_state(client_id, game_id, res) {
    var game = games.get(game_id);
    var state = game.get_state(client_id);

    res.writeHead(200, {
        'Set-Cookie': `client_id=${client_id}`,
        'Content-Type': 'application/json'
    });
    res.write(`{ "id": "${game_id}", "state": ${JSON.stringify(state)}}`);
    res.end();
}

http.createServer(function (req, res) {
    var reqURL = url.parse(req.url, true /* parseQueryString */);

    var cookies = parseCookies(req);

    var client_id = cookies["client_id"];
    if (client_id == null) {
        client_id = uuid();
    }

    if (reqURL.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html'}); 
        res.write('Hello World'); 
        res.end(); 
    } else if (reqURL.pathname === '/api/game/new') {
        var game_id = uuid();
        games.create(game_id);

        return_game_state(client_id, game_id, res);
    } else if (reqURL.pathname === '/api/game/join') {
        var game_id = reqURL.query['id'];
        var player = reqURL.query['player'];
        if (game_id == null || !games.is_valid(game_id)) {
            return_invalid_params(res);
        } else {
            games.get(game_id).join(client_id, player);
            return_game_state(client_id, game_id, res);
        }
    } else if (reqURL.pathname === '/api/game/state') {
        var game_id = reqURL.query['id'];
        if (game_id == null || !games.is_valid(game_id)) {
            return_invalid_params(res);
        } else {
            return_game_state(client_id, game_id, res);
        }
    } else if (reqURL.pathname === '/api/game/play') {
        var game_id = reqURL.query['id'];
        var play = reqURL.query['play'];

        if (game_id == null || !games.is_valid(game_id) || play == null) {
            return_invalid_params(res);
        } else {
            games.get(game_id).play(client_id, play);
            return_game_state(client_id, game_id, res);
        }
    } else {
        res.writeHead(404, {'Content-Type': 'text/html'}); 
        res.write('Invalid URL'); 
        res.end(); 
    }
}).listen(3000, function() { 
    console.log("server start at port 3000"); 
});
