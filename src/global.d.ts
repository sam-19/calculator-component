import { BasicCalculator } from '.'

declare global {
    interface HTMLElementTagNameMap {
        "basic-calculator": BasicCalculator
    }
}
declare const math: typeof import('mathjs')