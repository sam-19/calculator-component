/**
 * Basic calculator web component.
 * @package    sam-19/calculator-component
 * @copyright  2024 Sampsa Lohi
 * @license    MIT
 */

import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { inlineWorker } from '#assets'

type ExpressionElement = {
    display: string
    element: string
    type: ExpressionType
}
type ExpressionType = 'function' | 'modifier' | 'number' | 'operator' | 'symbol'
type HistoryEntry = {
    answer: string | null
    answerImg: number | null
    answerReal: number | null
    error: string | null
    expression: ExpressionElement[]
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

    @property({ type: String })
    error: string | null = null

    @property({ type: Array })
    expression: ExpressionElement[] = []

    @property({ type: Array })
    history: HistoryEntry[] = []

    @property({ type: String })
    historyText = ''

    @property({ type: Boolean })
    invTrig = false

    @property({ type: String })
    screenText = ''

    @property({ type: Number })
    unclosedParentheses = 0

    // Getters.
    private get _modifiersActive () {
        return (this.answer && this.answerImg === null) ||
               (
                this.expression.length > 0 &&
                this.expression[this.expression.length - 1].type === 'number'
               )
    }
    private get _operatorsActive () {
        const incompatibleTypes = ['function', 'modifier', 'operator'] as ExpressionType[]
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
        this._input(`(${lastEntry.answer})`, 'number', 'Ans')
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
    private _evaluateExpression () {
        if (!this.expression?.length) {
            return
        }
        const expression = this.expression.map(e => e.element).join('')
                         + this.autoComplete
        worker.postMessage({
            expression: expression,
        })
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
        } else if (Object.hasOwn(message.data.result, 're')) {
            this.answerReal = message.data.result.re
            this.answerImg = message.data.result.im
            this.answer = this._numToPrecision(message.data.result.re as number, 6)
            if (message.data.result.im as number < 0) {
                this.answer += `-${ this._numToPrecision(-(message.data.result.im as number), 6) }i`
            } else {
                this.answer += `+${ this._numToPrecision(message.data.result.im as number, 6) }i`
            }
        } else if (String(message.data.result) === message.data.expression) {
            // Probably a missclick, don't transfer this history.
            return
        } else {
            this.answerReal = message.data.result
            this.answerImg = null
            this.answer = this._numToPrecision(message.data.result as number, 12)
        }
        const closingParentheses = [] as ExpressionElement[]
        for (let i=0; i<this.unclosedParentheses; i++) {
            closingParentheses.push({
                display: ')',
                element: ')',
                type: 'symbol',
            })
        }
        this.history.push({
            answer: this.answer,
            answerImg: this.answerImg,
            answerReal: this.answerReal,
            error: this.error,
            expression: [...this.expression, ...closingParentheses],
        })
        this.expression = []
        this._udpateInput()
        this._updateHistory()
    }
    private _input (exp: string, expType: ExpressionType, display?: string) {
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
        return display
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
                         + (visibleEntry.expression.length ? ' = ' : '')
                         + `${ visibleEntry.error ? 'error' : visibleEntry.answer }`
    }
    private _udpateInput () {
        const textParts = [] as string[]
        this.unclosedParentheses = 0
        for (const ex of this.expression) {
            textParts.push(ex.display)
        }
        this.screenText = textParts.join('')
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
                        title="Clear all entries"
                        aria-label="Clear all entries"
                        @click=${{ handleEvent: () => this._ac() }}
                    >AC</div>
                    <div
                        class="key key-history"
                        part="key key-history"
                        title="Clear previous entry"
                        aria-label="Clear previous entry"
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
                        @click=${{ handleEvent: () => this._input('.', 'modifier') }}
                    >.</div>
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
                        class="key key-ans"
                        part="key key-ans"
                        title="Insert previous answer"
                        aria-label="Insert previous answer"
                        @click=${{ handleEvent: () => this._ans() }}
                    >Ans</div>
                    <div
                        class="key key-enter"
                        part="key key-enter"
                        title="Calculate answer"
                        aria-label="Calculate answer"
                        @click=${{ handleEvent: () => this._evaluateExpression() }}
                    >=</div>
                </div>
            </div>
        </div>
        `
    }

    // Styles.
    static styles = css`
    :host {
        font-size: min(4vw, 2.5vh);
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
    }
    .calculator {
        width: 100%;
        height: min(150vw, 100vh);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        box-sizing: content-box;
    }
    .screen {
        width: min(100vw, 67vh);
        flex: 0 0 min(14vw, 8.5vh);
        color: #444;
        background-color: #FAFAFF;
        border-radius: min(2vw, 1vh) min(2vw, 1vh) 0 0;
        outline: 1px solid rgba(63, 63, 127, 0.1);
    }
    .history {
        width: 100%;
        height: min(8vw, 5vh);
        font-size: min(4vw, 2.5vh);
        box-sizing: border-box;
        margin: 0;
        padding: min(2vw, 1vh) min(2vw, 1vh) 0 min(2vw, 1vh);
        text-align: left;
        opacity: 0.6;
        overflow: hidden;
    }
    .input {
        width: calc(100% - min(8vw, 5vh));
        height: min(10vw, 6vh);
        border: none;
        font-size: min(8vw, 5vh);
        padding: min(4vw, 2.5vh);
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
        width: min(100vw, 67vh);
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
            padding: min(1vw, 0.5vh);
            background-color: #F0F0FF;
            color: #333;
            outline: 1px solid rgba(60, 60, 120, 0.1);
            box-shadow: none;
            text-align: center;
            transition: all 0.2s;
        }
        .key:hover:not(.disabled) {
            box-shadow: 0 0 min(1vw, 0.5vh) 0 rgba(63, 63, 223, 0.5);
            z-index: 1;
        }
        .key:active:not(.disabled), .key.active:not(.disabled) {
            box-shadow: inset 0 0 5px 0 rgba(63, 63, 223, 0.5);
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
            color: #777;
            cursor: default;
        }
        .bottom-row div:first-child {
            border-radius: 0 0 0 min(2vw, 1vh);
        }
        .bottom-row div:last-child {
            border-radius: 0 0 min(2vw, 1vh) 0;
        }
        .inv {
            display: none;
        }
        sup {
            vertical-align: super;
            position: relative;
            top: -0.3em;
            font-size: min(2.5vw, 1.5vh);
        }
            sup.char {
                /* Make the small x easier to see with slightly larger font. */
                font-size: min(3vw, 1.75vh);
            }
    `
}
export const BASIC_OPERATIONS = {

}
export { BasicCalculator }