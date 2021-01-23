const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const {inspect} = require('util');

// Util

const pipe = (...funcs) => (...args) => funcs.slice(1).reduce((res, f) => f(res), funcs[0](...args));
const compose = (...funcs) => pipe(...funcs.reverse());
const instanciate = ClassObject => (...args) => new ClassObject(...args);
const partial = (f, ...args) => (...rest) => f(...args, ...rest);
const zip = arr => arr[0].length ? arr[0].map((_, i) => arr.map(row => row[i])) : [];
const access = prop => obj => obj[prop];

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
    boolean: Symbol('boolean'),
    nil: Symbol('nil'),
};

const True = {
    type: types.boolean,
    value: true,
};

const False = {
    type: types.boolean,
    value: false,
};

const nil = {
    type: types.nil,
};

const wrapType = type => func => (...args) => ({type, value: func(...args.map(access('value')))});
const wrapNumber = wrapType(types.number);
const wrapBoolean = wrapType(types.boolean);

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
            value: new Number(token).valueOf(),
        };
    } else if (token === 'true' || token === 'false') {
        return {
            type: types.boolean,
            value: token === 'true'
        };
    } else if (token === 'nil') {
        return nil;
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
    if (typeof ast === 'function') {
        return `${inspect(ast)}`;
    }
    switch (ast.type) {
        case types.list:
            return `(${ast.value.map(printAst).join(' ')})`;
        case types.number:
            return ast.value.toString();
        case types.symbol:
            return ast.value;
        case types.boolean:
            return ast.value.toString();
        case types.nil:
            return 'nil';
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
            if (!ast.value.length) {
                return ast;
            }
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
                case 'do':
                    return ast.value.slice(1).map(partial(evaluate, env)).slice(-1)[0];
                case 'if': {
                    const cond = evaluate(env, ast.value[1]);
                    if (cond === nil || (cond.type === types.boolean && cond.value === false)) {
                        return ast.value.length >= 4 ? evaluate(env, ast.value[3]) : nil;
                    }
                    return evaluate(env, ast.value[2]);
                }
                case 'fn*': {
                    const argNames = ast.value[1].value;
                    const body = ast.value[2];
                    return (...args) => {
                        const newEnv = Object.create(env);
                        zip([argNames.map(arg => arg.value), args]).forEach(([prop, val]) => {
                            newEnv[prop] = val;
                        });
                        return evaluate(newEnv, body);
                    };
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
        '+': wrapNumber((...args) => args.reduce((acc, num) => acc + num, 0)),
        '-': wrapNumber((a, b) => a - b),
        '*': wrapNumber((...args) => args.reduce((acc, num) => acc * num, 1)),
        '/': wrapNumber((a, b) => a / b),
        'prn': a => (console.log(print(a)), nil), // eslint-disable-line no-console
        'list': (...args) => ({type: types.list, value: args}),
        'list?': a => a.type === types.list ? True : False,
        'empty?': list => list.value.length === 0 ? True : False,
        'count': list => ({type: types.number, value: list.value && list.value.length || 0}),
        '=': function eq(a, b) {
            if (a.type !== b.type) {
                return False;
            } else if (a.type !== types.list) {
                return a.value === b.value ? True : False;
            }
            return a.value.length === b.value.length && zip([a.value, b.value]).every(([a, b]) => {
                return eq(a, b) === True;
            }) ? True : False;
        },
        '<': wrapBoolean((a, b) => a < b),
        '>': wrapBoolean((a, b) => a > b),
        '<=': wrapBoolean((a, b) => a <= b),
        '>=': wrapBoolean((a, b) => a >= b),
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

