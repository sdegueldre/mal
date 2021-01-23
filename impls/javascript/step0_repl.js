const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const pipe = (...funcs) => (...args) => funcs.slice(1).reduce((res, f) => f(res), funcs[0](...args));
const compose = (...funcs) => pipe(...funcs.reverse());

async function input(prompt) {
    return new Promise(resolve => readline.question(prompt, resolve));
}

function read(arg) {
    return arg;
}

function evaluate(arg) {
    return arg;
}

function print(arg) {
    return arg;
}

function rep(input) {
    return pipe(read, evaluate, print)(input);
}

(async () => {
    while (true) { //eslint-disable-line no-constant-condition
        const userInput = await input('user> ');
        console.log(rep(userInput)); //eslint-disable-line no-console
    }
})();

