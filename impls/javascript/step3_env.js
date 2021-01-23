const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Util

const pipe = (...funcs) => (...args) => funcs.slice(1).reduce((res, f) => f(res), funcs[0](...args));
const compose = (...funcs) => pipe(...funcs.reverse());
const instanciate = ClassObject => (...args) => new ClassObject(...args);
const partial = (f, ...args) => (...rest) => f(...args, ...rest);

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
    if (token.match(/^-?[0-9.]+$/)) {
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
    throw new Error('Unkown ast node type: ' + ast.type);
}

// Interpreter

function read(arg) {
    return readString(arg);
}

function evaluate(env, ast) {
    // console.log("evaluate, env:", env, "AST", ast);
    switch (ast.type) {
        case types.symbol:
            if (!(ast.value in env)) {
                throw new Error(`'${ast.value}' not found`);
            }
            return env[ast.value];
        case types.list: {
            switch (ast.value[0].value) {
                case undefined:
                    return ast;
                case 'def!':
                    env[ast.value[1].value] = evaluate(env, ast.value[2]);
                    return env[ast.value[1].value];
                case 'let*': {
                    const newEnv = Object.create(env);
                    const bindings = ast.value[1].value.reverse();
                    while (bindings.length) {
                        newEnv[bindings.pop().value] = evaluate(newEnv, bindings.pop());
                    }
                    return evaluate(newEnv, ast.value[2]);
                }
            }
            const evaluated = ast.value.map(partial(evaluate, env));
            return evaluated[0](...evaluated.slice(1));
        }
    }
    return ast;
}

function print(arg) {
    return printAst(arg);
}

function rep(input, env) {
    return pipe(read, partial(evaluate, env), print)(input);
}

// Main loop

(async () => {
    const env = {
        '+': (...args) => ({type: types.number, value: args.reduce((acc, arg) => acc + arg.value, 0)}),
        '-': (a, b) => ({type: types.number, value: a.value - b.value}),
        '*': (...args) => ({type: types.number, value: args.reduce((acc, arg) => acc * arg.value, 1)}),
        '/': (a, b) => ({type: types.number, value: a.value / b.value}),
    };
    Object.setPrototypeOf(env, null);
    while (true) { //eslint-disable-line no-constant-condition
        const userInput = await input('user> ');
        try {
            console.log(rep(userInput, env)); //eslint-disable-line no-console
        } catch (e) {
            // Apparently tests will only look on stdout, not stderr
            console.log(e); //eslint-disable-line no-console
        }
    }
})();

