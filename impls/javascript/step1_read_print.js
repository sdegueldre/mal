const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Util

const pipe = (...funcs) => (...args) => funcs.slice(1).reduce((res, f) => f(res), funcs[0](...args));
const compose = (...funcs) => pipe(...funcs.reverse());
const instanciate = ClassObject => (...args) => new ClassObject(...args);

async function input(prompt) {
    return new Promise(resolve => readline.question(prompt, resolve));
}

// Reader

class Reader {
    constructor(tokens) {
        this.position = 0;
        this.tokens = tokens;
    }

    next() {
        return this.tokens[this.position++];
    }

    peek() {
        return this.tokens[this.position];
    }
}

function tokenize(string) {
    const regex = /[\s,]*(~@|[[\]{}()'`~^@]|"(?:\\.|[^\\"])*"?|;.*|[^\s[\]{}('"`,;)]*)/g;
    const tokens = [];
    let match = regex.exec(string);
    while (match && match[0] !== '') {
        tokens.push(match[1]);
        match = regex.exec(string);
    }
    return tokens;
}

const types = {
    number: Symbol('Number'),
    symbol: Symbol('Symbol'),
    list: Symbol('List'),
};

function readList(reader) {
    reader.next(); // consume '('
    const list = [];
    while (reader.peek() !== ')') {
        if (!reader.peek()) {
            throw new Error('Unexpected EOF while reading list');
        }
        list.push(readForm(reader));
    }
    reader.next(); // consume ')'
    return {
        type: types.list,
        value: list,
    };
}

function readAtom(reader) {
    const token = reader.next();
    if (token.match(/^[0-9.]$/)) {
        return {
            type: types.number,
            value: new Number(token),
        };
    }
    return {
        type: types.symbol,
        value: token,
    };
}

function readForm(reader) {
    switch (reader.peek()) {
        case '(':
            return readList(reader);
        default:
            return readAtom(reader);
    }
}

function readString(string) {
    return pipe(tokenize, instanciate(Reader), readForm)(string);
}

// Printer

function printAst(ast) {
    switch (ast.type) {
        case types.list:
            return `(${ast.value.map(printAst).join(' ')})`;
        case types.number:
            return ast.value.toString();
        case types.symbol:
            return ast.value;
    }
    throw new Error('Unkown ast node type:', ast.type, ast);
}

// Interpreter

function read(arg) {
    return readString(arg);
}

function evaluate(arg) {
    return arg;
}

function print(arg) {
    return printAst(arg);
}

function rep(input) {
    return pipe(read, evaluate, print)(input);
}

// Main loop

(async () => {
    while (true) { //eslint-disable-line no-constant-condition
        const userInput = await input('user> ');
        try {
            console.log(rep(userInput)); //eslint-disable-line no-console
        } catch (e) {
            // Apparently tests will only look on stdout, not stderr
            console.log(e); //eslint-disable-line no-console
        }
    }
})();

