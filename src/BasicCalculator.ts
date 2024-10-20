/**
 * Basic calculator web component.
 * @package    sam-19/calculator-component
 * @copyright  2024 Sampsa Lohi
 * @license    MIT
 */

import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { inlineWorker } from './assets'

/**
 * A single node (or entity) of a mathematical expression.
 * Can be a digit, operator, function name etc.
 */
type ExpressionNode = {
    /** Text as it displayed to the user. */
    display: string
    /** The text element used for the MathJs expression. */
    element: string
    /** Type of this node. */
    type: NodeType
}
type NodeType = 'function' | 'modifier' | 'number' | 'operator' | 'symbol'
/**
 * Properties of a previously evaluated expression.
 */
type HistoryEntry = {
    /** The answer of the expression, as it was displayed on the screen; null if there was an error. */
    answer: string | null
    /** The imaginary number part of the answer, or null if the answer was not a complex number. */
    answerImg: number | null
    /** The real number part of the answer, null if there was an error. */
    answerReal: number | null
    /** Error from the expression, null if there was no error. */
    error: string | null
    /** Node array of the expression. */
    expression: ExpressionNode[]
    /** LaTeX string of the expression and answer, null if there was an error. */
    latex: string | null
    /** Is the result rounded. */
    round: boolean
}

import workerSrc from '../dist/mathjs-worker?raw'

const worker = inlineWorker('mathjs-worker', workerSrc)

@customElement('basic-calculator')
export default class BasicCalculator extends LitElement {

    constructor () {
        super()
        worker.addEventListener('message', this._handleWorkerResponse.bind(this))
    }

    // Properties.
    @property({ type: String })
    angleUnit: 'deg' | 'rad' = 'deg'

    @property({ type: String })
    answer: string | null = null

    @property({ type: Number })
    answerImg: number | null = null

    @property({ type: Number })
    answerReal: number | null = null

    @property({ type: String })
    autoComplete = ''

    @property({ attribute: 'decimal-separator', type: String })
    // Make a guess for the default separator, can be overridden with component attribute.
    decimalSeparator = (0.1).toLocaleString().replace(/\d/g, '')

    @property({ type: String })
    error: string | null = null

    @property({ type: Array })
    expression: ExpressionNode[] = []

    @property({ type: Array })
    history: HistoryEntry[] = []

    @property({ type: String })
    historyText = ''

    @property({ type: Boolean })
    invTrig = false

    @property({ attribute: 'is-fixed', type: Boolean })
    isFixed = false

    @property({ type: String })
    latex: string | null = null

    @property({ type: String })
    screenText = ''

    @property({ attribute: 'thousand-separator', type: String })
    thousandSeparator = ' '

    @property({ type: Number })
    unclosedParentheses = 0

    // Getters.
    private get _modifiersActive () {
        if (!this.expression.length) {
            // See if can append the modifier into the currently visible answer.
            return (this.answer && this.answerImg === null) ? true : false
        }
        const lastNode = this.expression[this.expression.length - 1]
        return (
            // We can append a modifier to a number or a symbol, unless it's an opening parenthese.
            lastNode.type === 'number' || (
                lastNode.type === 'symbol' && lastNode.element !== '('
            )
        )
    }
    private get _operatorsActive () {
        const incompatibleTypes = ['function', 'modifier', 'operator'] as NodeType[]
        // Expression or function cannot start with an operator (other than the minus sign),
        // and we cannot use multiple operators in a row.
        return this.answer ||
               (
                this.expression.length > 0 &&
                !incompatibleTypes.includes(this.expression[this.expression.length - 1].type) &&
                this.expression[this.expression.length - 1].element !== '('
               )
    }

    // Methods.
    private _ac () {
        if (this.expression.length || this.answer) {
            // Clear current expression and answer.
            this.error = null
            this.answer = null
            this.answerReal = null
            this.answerImg = null
            this.expression = []
            this._udpateInput()
        } else {
            // If there is no expression (second press), reset state.
            this._reset()
        }
    }
    private _angle () {
        this.angleUnit = this.angleUnit === 'deg' ? 'rad' : 'deg'
        worker.postMessage({ angleUnit: this.angleUnit })
    }
    private _ans () {
        const lastEntry = this.history[this.history.length - 1]
        if (!lastEntry?.answer) {
            return
        }
        const ansComplex = this.answerImg === null
                         ? lastEntry.answerReal?.toString()
                         : `${this.answerReal}${
                                this.answerImg < 0 ? '-' : '+'
                            }${this.answerImg}`
        // Input simple numbers as is, else wrap in parentheses.
        if (ansComplex?.match(/[^0-9.]/)) {
            this._input(`(${ansComplex})`, 'number', 'Ans')
        } else {
            this._input(`${ansComplex}`, 'number', 'Ans')
        }
    }
    private _capitalize (text: string) {
        return `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}`
    }
    private _ce () {
        if (this.error) {
            this.error = null
        }
        if (this.answer) {
            this.answer = null
        } else {
            this.expression.pop()
        }
        this._udpateInput()
    }
    /** Convert dots in the given text into locale-appropriate decimal separators. */
    private _decSep (text: string) {
        return text.replace('.', this.decimalSeparator)
    }
    private _evaluateExpression (e: PointerEvent) {
        if (!this.expression?.length) {
            return
        }
        const expression = this.expression.map(e => e.element).join('')
                         + this.autoComplete
        worker.postMessage({
            expression: expression,
            round: e.shiftKey,
        })
    }
    private _formatNumbers (expression: string) {
        if (!this.thousandSeparator) {
            return expression
        }
        const numRegexp = new RegExp(`([0-9]+\\${this.decimalSeparator}?[0-9]*)`)
        const expParts = expression.split(numRegexp)
        for (let i=1; i<expParts.length; i++) {
            if (!expParts[i].match(numRegexp)) {
                continue
            }
            const nodes = expParts[i].split('')
            nodes.reverse()
            let consecDigs = -1
            let decimal = nodes.includes(this.decimalSeparator)
            for (let j=0; j<nodes.length; j++) {
                if (decimal) {
                    if (nodes[j] === this.decimalSeparator) {
                        decimal = false
                    } else {
                        continue
                    }
                }
                if (nodes[j].match(/^\d$/)) {
                    consecDigs++
                } else {
                    consecDigs = -1
                }
                if (consecDigs === 3) {
                    nodes[j] += this.thousandSeparator
                    consecDigs = 0
                }
            }
            nodes.reverse()
            expParts[i] =  nodes.join('')
        }
        return expParts.join('')
    }
    private _handleWorkerResponse (message: MessageEvent) {
        if (!message?.data) {
            return
        }
        if (message.data.error) {
            this.answer = null
            this.answerReal = null
            this.answerImg = null
            this.error = message.data.error
            this.latex = null
        } else if (String(message.data.result) === message.data.expression) {
            // Probably a misclick, don't transfer this to history.
            return
        } else {
            if (Object.hasOwn(message.data.result, 're')) {
                this.answerReal = message.data.result.re
                this.answerImg = message.data.result.im
                this.answer = this._numToPrecision(message.data.result.re as number, 6)
                if (message.data.result.im as number < 0) {
                    this.answer += `-${ this._numToPrecision(-(message.data.result.im as number), 6) }i`
                } else {
                    this.answer += `+${ this._numToPrecision(message.data.result.im as number, 6) }i`
                }
                this.latex = `${
                    this._decSep(message.data.latex)
                } ${message.data.round ? '≈' : '=' } ${
                    this.answer
                }`
            } else {
                this.answerReal = message.data.result
                this.answerImg = null
                this.answer = this._numToPrecision(message.data.result as number, 12)
                this.latex = `${
                    this._decSep(message.data.latex)
                } ${message.data.round ? '≈' : '=' } ${
                    this._numToPrecision(message.data.result as number, 9)
                }`
            }
            this.answer = this._formatNumbers(this.answer)
        } 
        const closingParentheses = [] as ExpressionNode[]
        for (let i=0; i<this.unclosedParentheses; i++) {
            closingParentheses.push({
                display: ')',
                element: ')',
                type: 'symbol',
            })
        }
        const fullExpression = [...this.expression, ...closingParentheses]
        this.history.push({
            answer: this.answer,
            answerImg: this.answerImg,
            answerReal: this.answerReal,
            error: this.error,
            expression: fullExpression,
            latex: this.latex,
            round: message.data.round,
        })
        this.expression = []
        this._udpateInput()
        this._updateHistory()
        const event = new CustomEvent(
            'result', 
            { 
                detail: {
                    answer: message.data.result,
                    complex: message.data.result === null ? null : {
                        im: this.answerImg,
                        re: this.answerReal,
                    },
                    error: message.data.error,
                    expression: fullExpression.map(e => e.element).join(''),
                    latex: this.latex,
                    round: message.data.round,
                }
            }
        )
        this.dispatchEvent(event)
    }
    private _input (exp: string, expType: NodeType, display?: string) {
        // Don't allow inputting certain elements if they are not active.
        if (expType == 'modifier' && !this._modifiersActive) {
            return
        }
        if (expType == 'operator' && exp !== '-' && !this._operatorsActive) {
            return
        }
        if (exp === ')' && this.unclosedParentheses < 1) {
            return
        }
        if (this.answer) {
            // Allow inserting opertors directly after any answer
            // and modifiers behind answers that don't have a complex component.
            if (
                expType === 'operator' ||
                expType === 'modifier' && this.answerImg === null
            ) {
                // Detect answers with exponent component.
                const inputAns = this.answer.match(/[^\d.]/)
                                ? `(${this.answer})`
                                : this.answer
                this._input(inputAns, 'number', inputAns)
            } else {
                // Otherwise clear the answer and start a new expression.
                this.answer = null
                this.answerReal = null
                this.answerImg = null
            }
        }
        if (this.error) {
            this.error = null
        }
        this.expression.push({
            display: display || exp,
            element: exp,
            type: expType,
        })
        this._udpateInput()
    }
    private _inv () {
        this.invTrig = !this.invTrig
    }
    private _numToPrecision (number: number, precision: number) {
        // Strip all-zero decimals.
        let display = number.toPrecision(precision).replace(/\.0+$/, '')
        // Strip zeroes from the end of a decimal.
        if (display.includes('.')) {
            display = display.replace(/0+$/, '')
        }
        // Return the stripped value with locale-appropriate decimal separator.
        return this._decSep(display)
    }
    private _rand () {
        const lastItem = this.expression[this.expression.length - 1]
        const needsMulti = lastItem && (lastItem.element.match(/^[0-9\.]$/) || lastItem.element === ')')
        if (needsMulti) {
            this._input('*', 'operator', '×')
        }
        const rnd = Math.random().toFixed(8)
        this._input(rnd, 'number', rnd)
    }
    private _reset () {
        this.answer = null
        this.answerReal = null
        this.answerImg = null
        this.autoComplete = ''
        this.error = null
        this.expression = []
        this.history = []
        this.invTrig = false
        this.latex = null
        this.unclosedParentheses = 0
        this._udpateInput()
        this._updateHistory()
    }
    private _updateHistory () {
        if (!this.history.length) {
            this.historyText = ''
            return
        }
        const visibleEntry = this.history[this.history.length - 1]
        this.historyText = visibleEntry.expression.map(e => e.display).join('')
                         + (visibleEntry.expression.length 
                            ? ` ${visibleEntry.round ? '≈' : '=' } ` : ''
                         )
                         + `${ visibleEntry.error ? 'error' : visibleEntry.answer }`
    }
    private _udpateInput () {
        const textParts = [] as string[]
        this.unclosedParentheses = 0
        for (const ex of this.expression) {
            textParts.push(ex.display)
        }
        this.screenText = this._formatNumbers(textParts.join(''))
        this.unclosedParentheses = (this.screenText.match(/\(/g) || []).length
                                 - (this.screenText.match(/\)/g) || []).length
        if (this.unclosedParentheses > 0) {
            this.autoComplete = ')'.repeat(this.unclosedParentheses)
        } else {
            this.autoComplete = ''
        }
    }

    // Render the UI.
    render () {
        const root = document.querySelector(':root') as HTMLHtmlElement
        const parent = this.parentElement as HTMLDivElement
        if (!root || !parent) {
            return
        }
        const parentStyles = getComputedStyle(parent)
        const hPads = parseFloat(parentStyles.paddingLeft) + parseFloat(parentStyles.paddingRight)
        const vPads = parseFloat(parentStyles.paddingTop) + parseFloat(parentStyles.paddingBottom)
        const parentW = parent.offsetWidth - hPads
        const parentH = parent.offsetHeight - vPads
        if (
            this.isFixed &&
            ( 
                parentW/root.offsetWidth < 1 ||
                parentH/root.offsetHeight < 1
            ) 
        ) {
            const aspect = 2/3
            const refWidth = parentW/parentH <= aspect
                           ? parentW
                           : aspect*parentH
            const refHeight = parentW/parentH >= aspect
                            ? parentH
                            : parentW/aspect
            this.style.setProperty('--height-full', `${refHeight}px`)
            this.style.setProperty('--width-full', `${refWidth}px`)
            this.style.setProperty('--size-small', `${0.015*refHeight}px`)
            this.style.setProperty('--size-medium', `${0.025*refHeight}px`)
            this.style.setProperty('--size-large', `${0.05*refHeight}px`)
            this.style.setProperty('--screen-height', `${0.085*refHeight}px`)
            this.style.setProperty('--input-height', `${0.06*refHeight}px`)
            this.style.setProperty('--padding-small', `${0.005*refHeight}px`)
            this.style.setProperty('--padding-medium', `${0.01*refHeight}px`)
        }
        return html`
        <div class="calculator" part="calculator">
            <div class="screen" part="screen">
                <div class="history" part="history">${ this.historyText }</div>
                <div class="input" part="input">
                    <span class="expression" part="expression">
                        ${ this.error || this.answer || this.screenText }
                    </span>
                    <span class="auto-complete" part="auto-complete">
                        ${ this.autoComplete }
                    </span>
                </div>
            </div>
            <div class="keyboard" part="keyboard">
                <div class="key-row" part="key-row">
                    <div
                        class="key key-history"
                        part="key key-history"
                        title="Insert random number"
                        aria-label="Insert random number"
                        @click=${{ handleEvent: () => this._rand() }}
                    >Rnd</div>
                    <div
                        class="key key-func"
                        part="key key-func"
                        title="Angle unit: ${ this.angleUnit === 'deg' ? 'degrees' : 'radians' }"
                        aria-label="Angle unit: ${ this.angleUnit === 'deg' ? 'degrees' : 'radians' }"
                        @click=${{ handleEvent: () => this._angle() }}
                    >${ this._capitalize(this.angleUnit) }</div>
                    <div
                        class="key key-history"
                        part="key key-history"
                        title="${ this.expression.length ? 'Clear input' : 'Clear history' }"
                        aria-label="${ this.expression.length ? 'Clear input' : 'Clear history' }"
                        @click=${{ handleEvent: () => this._ac() }}
                    >AC</div>
                    <div
                        class="key key-history"
                        part="key key-history"
                        title="Remove last entry"
                        aria-label="Remove last entry"
                        @click=${{ handleEvent: () => this._ce() }}
                    >CE</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-func"
                        part="key key-func"
                        title="Base ten logarithm"
                        aria-label="Base ten logarithm"
                        @click=${{ handleEvent: () => this._input('log10(', 'function', 'log(') }}
                    >log</div>
                    <div
                        class="key key-func"
                        part="key key-func"
                        title="Base e natural logarithm"
                        aria-label="Base e natural logarithm"
                        @click=${{ handleEvent: () => this._input('log(', 'function', 'ln(') }}
                    >ln</div>
                    <div
                        class="key key-func${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-func${this._modifiersActive ? '' : ' disabled' }"
                        title="Factorial"
                        aria-label="Factorial"
                        @click=${{ handleEvent: () => this._input('!', 'modifier') }}
                    >x!</div>
                    <div
                        class="key key-history${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-history${this._modifiersActive ? '' : ' disabled' }"
                        title="Imaginary number"
                        aria-label="Imaginary number"
                        @click=${{ handleEvent: () => this._input('i', 'modifier') }}
                    >xi</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-trig${ this.invTrig ? ' active' : ''}"
                        part="key key-trig"
                        title="Invert trigonometric functions"
                        aria-label="Invert trigonometric functions"
                        @click=${{ handleEvent: () => this._inv() }}
                    >Inv</div>
                    <div
                        class="key key-trig"
                        part="key key-trig"
                        title="${ this.invTrig ? 'Inverse sine' : 'Sine' }"
                        aria-label="${ this.invTrig ? 'Inverse sine' : 'Sine' }"
                        @click=${{ handleEvent: () => this._input(this.invTrig ? 'asin(' : 'sin(', 'function') }}
                    >sin<sup class="${ this.invTrig ? '' : 'inv '}">-1</sup></div>
                    <div
                        class="key key-trig"
                        part="key key-trig"
                        title="${ this.invTrig ? 'Inverse cosine' : 'Cosine' }"
                        aria-label="${ this.invTrig ? 'Inverse cosine' : 'Cosine' }"
                        @click=${{ handleEvent: () => this._input(this.invTrig ? 'acos(' : 'cos(', 'function') }}
                    >cos<sup class="${ this.invTrig ? '' : 'inv '}">-1</sup></div>
                    <div
                        class="key key-trig"
                        part="key key-trig"
                        title="${ this.invTrig ? 'Inverse tangent' : 'Tangent' }"
                        aria-label="${ this.invTrig ? 'Inverse tangent' : 'Tangent' }"
                        @click=${{ handleEvent: () => this._input(this.invTrig ? 'atan(' : 'tan(', 'function') }}
                    >tan<sup class="${ this.invTrig ? '' : 'inv '}">-1</sup></div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-const"
                        part="key key-const"
                        title="Pi"
                        aria-label="Pi"
                        @click=${{ handleEvent: () => this._input('(pi)', 'symbol', 'π') }}
                    >π</div>
                    <div
                        class="key key-const"
                        part="key key-const"
                        title="Constant e"
                        aria-label="Constant e"
                        @click=${{ handleEvent: () => this._input('e', 'symbol') }}
                    >e</div>
                    <div
                        class="key key-const"
                        part="key key-const"
                        title="Constant e to the power of"
                        aria-label="Constant e to the power of"
                        @click=${{ handleEvent: () => this._input('e^', 'function') }}
                    >e<sup class="char ">x</sup></div>
                    <div
                        class="key key-const"
                        part="key key-const" 
                        title="Ten to the power of"
                        aria-label="Ten to the power of"
                        @click=${{ handleEvent: () => this._input('10^', 'function') }}
                    >10<sup class="char ">x</sup></div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-pow"
                        part="key key-pow"
                        title="Square root"
                        aria-label="Square root"
                        @click=${{ handleEvent: () => this._input('sqrt(', 'function', '√(') }}
                    >√</div>
                    <div
                        class="key key-pow${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-pow${this._modifiersActive ? '' : ' disabled' }"
                        title="Input squared"
                        aria-label="Input squared"
                        @click=${{ handleEvent: () => this._input('^(2)', 'modifier', '²') }}
                    >x<sup>2</sup></div>
                    <div
                        class="key key-pow${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-pow${this._modifiersActive ? '' : ' disabled' }"
                        title="Cube of input"
                        aria-label="Cube of input"
                        @click=${{ handleEvent: () => this._input('^(3)', 'modifier', '³') }}
                    >x<sup>3</sup></div>
                    <div
                        class="key key-pow${this._operatorsActive ? '' : ' disabled' }"
                        part="key key-pow${this._operatorsActive ? '' : ' disabled' }"
                        title="Exponent operator"
                        aria-label="Exponent operator"
                        disabled=""
                        @click=${{ handleEvent: () => this._input('^', 'operator') }}
                    >^</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number seven"
                        aria-label="Number seven"
                        @click=${{ handleEvent: () => this._input('7', 'number') }}
                    >7</div>
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number eight"
                        aria-label="Number eight"
                        @click=${{ handleEvent: () => this._input('8', 'number') }}
                    >8</div>
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number nine"
                        aria-label="Number nine"
                        @click=${{ handleEvent: () => this._input('9', 'number') }}
                    >9</div>
                    <div
                        class="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        part="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        title="Divide"
                        aria-label="Division operator"
                        @click=${{ handleEvent: () => this._input('/', 'operator', '÷') }}
                    >÷</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number four"
                        aria-label="Number four"
                        @click=${{ handleEvent: () => this._input('4', 'number') }}
                    >4</div>
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number five"
                        aria-label="Number five"
                        @click=${{ handleEvent: () => this._input('5', 'number') }}
                    >5</div>
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number six"
                        aria-label="Number six"
                        @click=${{ handleEvent: () => this._input('6', 'number') }}
                    >6</div>
                    <div
                        class="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        part="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        title="Multiply"
                        aria-label="Multiplication operator"
                        @click=${{ handleEvent: () => this._input('*', 'operator', '×') }}
                    >×</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-num"
                        part="key"
                        title="Number one"
                        aria-label="Number one"
                        @click=${{ handleEvent: () => this._input('1', 'number') }}
                    >1</div>
                    <div
                        class="key key-num"
                        part="key"
                        title="Number two"
                        aria-label="Number two"
                        @click=${{ handleEvent: () => this._input('2', 'number') }}
                    >2</div>
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number three"
                        aria-label="Number three"
                        @click=${{ handleEvent: () => this._input('3', 'number') }}
                    >3</div>
                    <div
                        class="key key-oper"
                        part="key key-oper"
                        title="Substract"
                        aria-label="Substraction operator"
                        @click=${{ handleEvent: () => this._input('-', 'operator') }}
                    >-</div>
                </div>
                <div class="key-row" part="key-row">
                    <div
                        class="key key-num"
                        part="key key-num"
                        title="Number zero"
                        aria-label="Number zero"
                        @click=${{ handleEvent: () => this._input('0', 'number') }}
                    >0</div>
                    <div
                        class="key key-num${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-num${this._modifiersActive ? '' : ' disabled' }"
                        title="Decimal separator"
                        aria-label="Decimal separator"
                        @click=${{ handleEvent: () => this._input('.', 'modifier', this.decimalSeparator) }}
                    >${ this.decimalSeparator }</div>
                    <div
                        class="key key-num${this._modifiersActive ? '' : ' disabled' }"
                        part="key key-num${this._modifiersActive ? '' : ' disabled' }"
                        title="Exponent"
                        aria-label="Exponent"
                        @click=${{ handleEvent: () => this._input('E', 'modifier') }}
                    >E</div>
                    <div
                        class="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        part="key key-oper${this._operatorsActive ? '' : ' disabled' }"
                        title="Add"
                        aria-label="Addition operator"
                        @click=${{ handleEvent: () => this._input('+', 'operator') }}
                    >+</div>
                </div>
                <div class="key-row bottom-row" part="key-row bottom-row">
                    <div
                        class="key key-par"
                        part="key key-par"
                        title="Open parentheses"
                        aria-label="Open parentheses"
                        @click=${{ handleEvent: () => this._input('(', 'symbol') }}
                    >(</div>
                    <div
                        class="key key-par${this.unclosedParentheses > 0 ? '' : ' disabled' }"
                        part="key key-par${this.unclosedParentheses > 0 ? '' : ' disabled' }"
                        title="Close parentheses"
                        aria-label="Close parentheses"
                        @click=${{ handleEvent: () => this._input(')', 'symbol') }}
                    >)</div>
                    <div
                        class="key key-ans${ this.history.length > 0 ? '' : ' disabled' }"
                        part="key key-ans${ this.history.length > 0 ? '' : ' disabled' }"
                        title="Insert previous answer"
                        aria-label="Insert previous answer"
                        @click=${{ handleEvent: () => this._ans() }}
                    >Ans</div>
                    <div
                        class="key key-enter"
                        part="key key-enter"
                        title="Calculate answer"
                        aria-label="Calculate answer"
                        @click=${{ handleEvent: (e: PointerEvent) => this._evaluateExpression(e) }}
                    >=</div>
                </div>
            </div>
        </div>
        `
    }

    // Styles.
    static styles = css`
    :host {
        font-size: var(--size-medium);
        font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
        line-height: 1.5;
        font-weight: 400;

        color-scheme: light dark;
        color: rgba(255, 255, 255, 0.87);
        background-color: #242424;

        box-sizing: border-box;
        margin: 0;

        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;

        /* Variables */
        --height-full: min(150vw, 100vh);
        --width-full: min(100vw, 67vh);
        --size-small: min(2.5vw, 1.5vh);
        --size-medium: min(4vw, 2.5vh);
        --size-large: min(8vw, 5vh);
        --screen-height: min(14vw, 8.5vh);
        --input-height: min(10vw, 6vh);
        --padding-small: min(1vw, 0.5vh);
        --padding-medium: min(2vw, 1vh);
    }
    .calculator {
        width: 100%;
        height: var(--height-full);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        box-sizing: content-box;
    }
    .screen {
        width: var(--width-full);
        flex: 0 0 var(--screen-height);
        color: #444;
        background-color: #FAFAFF;
        border-radius: var(--padding-medium) var(--padding-medium) 0 0;
        outline: 1px solid rgba(63, 63, 127, 0.1);
    }
    .history {
        width: 100%;
        height: var(--size-large);
        box-sizing: border-box;
        margin: 0;
        padding: var(--padding-medium) var(--padding-medium) 0 var(--padding-medium);
        text-align: left;
        opacity: 0.6;
        overflow: hidden;
    }
    .input {
        width: calc(100% - var(--size-large));
        height: var(--input-height);
        border: none;
        font-size: 2em;
        padding: var(--size-medium);
        text-align: right;
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        overflow: ellipsis;
    }
        .expression {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            position: relative;
            top: 0;
        }
        .auto-complete {
            opacity: 0.3;
        }
    .keyboard {
        display: flex;
        flex-direction: column;
        justify-content: stretch;
        min-height: 0;
        flex-grow: 1;
        width: var(--width-full);
        cursor: pointer;
        -moz-user-select: none;
        -khtml-user-select: none;
        -webkit-user-select: none;
        -o-user-select: none;
        user-select: none;
    }
        .key-row {
            display: flex;
            flex-direction: row;
            align-items: stretch;
            justify-content: space-around;
            flex: 10%;
            width: 100%;
        }
        .key {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            width: 100%;
            padding: var(--padding-small);
            background-color: #F0F0FF;
            color: #333;
            outline: 1px solid rgba(60, 60, 120, 0.1);
            box-shadow: none;
            text-align: center;
            transition: all 0.2s;
        }
        .key:hover:not(.disabled) {
            box-shadow: 0 0 var(--padding-small) 0 rgba(63, 63, 223, 0.5);
            z-index: 1;
        }
        .key:active:not(.disabled), .key.active:not(.disabled) {
            box-shadow: inset 0 0 var(--padding-small) 0 rgba(63, 63, 223, 0.5);
        }
            .key-num {
                background-color: #FDFDFD;
                font-size: 1.25em;
            }
            .key-oper {
                background-color: #DFDFFF;
                font-size: 1.5em;
                outline: 1px solid rgba(63, 63, 127, 0.25);
            }
            .key-enter {
                background-color: #A0A0F0;
                color: #fff;
                font-size: 1.75em;
                outline: 1px solid rgba(63, 63, 127, 0.5);
            }
        .key:disabled, .key.disabled {
            color: #888;
            cursor: default;
        }
        .bottom-row div:first-child {
            border-radius: 0 0 0 var(--padding-medium);
        }
        .bottom-row div:last-child {
            border-radius: 0 0 var(--padding-medium) 0;
        }
        .inv {
            display: none;
        }
        sup {
            vertical-align: super;
            position: relative;
            top: -0.3em;
            font-size: 0.67em;
        }
            sup.char {
                /* Make the small x easier to see with slightly larger font. */
                font-size: 0.75em;
            }
    `
}
export const BASIC_OPERATIONS = {

}
export { BasicCalculator }