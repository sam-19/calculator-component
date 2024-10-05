/**
 * Math.js worker for evaluating expressions.
 * @package    sam-19/calculator-component
 * @copyright  2024 Sampsa Lohi
 * @license    MIT
 */

//import * as math from 'mathjs' // math.js package doesn't export the 'import' method atm...
importScripts('https://unpkg.com/mathjs@13.2.0/lib/browser/math.js')

// Save the original trigonometric functions for repeated unit changes.
const oFns = new Map<string, (arg: number) => number>()
;[
    'sin', 'cos', 'tan', 'sec', 'cot', 'csc',
    'asin', 'acos', 'atan', 'atan2', 'asec', 'acot', 'acsc'
].forEach((name) => {
    oFns.set(name, self.math[name as keyof typeof self.math]) // The original function.
})

const defaultAngleUnit = 'deg'
const setAngleUnit = (angleUnit: 'rad' | 'deg' | 'grad') => {
    // Alter mathjs trigonometric functions to allow changing angle unit type.
    // This is almost directrly from https://mathjs.org/examples/browser/angle_configuration.html.html.
    const replacements = {} as { [name: string]: () => any }
    // Create trigonometric functions replacing the input depending on angle config.
    const fns1 = ['sin', 'cos', 'tan', 'sec', 'cot', 'csc']
    fns1.forEach((name) => {
        const fn = oFns.get(name)
        if (!fn) {
            return
        }
        const fnNumber = (x: number) => {
            // Convert from configured type of angles to radians.
            switch (angleUnit) {
                case 'deg': { return fn(x / 360 * 2 * Math.PI) }
                case 'grad': { return fn(x / 400 * 2 * Math.PI) }
                default: { return fn(x) }
            }
        }
        // Create a typed-function which check the input types.
        replacements[name] = self.math.typed(name, {
            'number': fnNumber,
            'Array | Matrix': (x) => {
                return self.math.map(x, fnNumber)
            }
        })
    })
    // Create inverse trigonometric functions replacing the output depending on angle config.
    const fns2 = ['asin', 'acos', 'atan', 'atan2', 'acot', 'acsc', 'asec']
    fns2.forEach((name) => {
        const fn = oFns.get(name)
        if (!fn) {
            return
        }
        const fnNumber = (x: number) => {
            const result = fn(x)
            if (typeof result === 'number') {
                // Convert from radians to configured type of angles.
                switch(angleUnit) {
                    case 'deg': { return result / 2 / Math.PI * 360 }
                    case 'grad': { return result / 2 / Math.PI * 400 }
                    default: { return result }
                }
            }
            return result
        }
        // Create a typed-function which check the input types.
        replacements[name] = self.math.typed(name, {
            'number': fnNumber,
            'Array | Matrix': (x) => {
                return self.math.map(x, fnNumber)
            }
        })
    })
    // Import all replacements into self.math.js, override existing trigonometric functions.
    // @ts-expect-error
    self.math.import(replacements, { override: true })
}
setAngleUnit(defaultAngleUnit)

self.onmessage = (message) => {
    if (message.data.angleUnit) {
        try {
            setAngleUnit(message.data.angleUnit)
        } catch (e) {
            self.postMessage({
                detail: String(e),
                error: 'Configuration error',
                expression: message.data.expression,
                result: null,
            })
        }
        return
    } else if (!message?.data?.expression) {
        self.postMessage({
            error: 'No expression',
            expression: null,
            result: null,
        })
        return
    }
    try {
        const result = self.math.evaluate(message.data.expression)
        self.postMessage({
            expression: message.data.expression,
            result: result,
        })
    } catch (e) {
        self.postMessage({
            detail: String(e),
            error: 'Syntax error',
            expression: message.data.expression,
            result: null,
        })
    }
}