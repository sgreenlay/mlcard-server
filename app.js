const ffi = require("@saleae/ffi");
const fs = require('fs');

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

var trained_model = fs.readFileSync('resources/model.json');

var game = libmlcard.alloc_game();

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