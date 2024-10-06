/**
 * Calculator web component assets.
 * @package    sam-19/calculator-component
 * @copyright  2024 Sampsa Lohi
 * @license    MIT
 */

/**
 * Create a Worker from a code string. The source must be compiled JavaScript (not TypeScript)!
 * @param name - Name of the worker (for logging).
 * @param code - Worker source code as string.
 * @returns Worker with the given source.
 */
export const inlineWorker = (name: string, code: string): Worker => {
    let blob = new Blob()
    try {
        blob = new Blob([code], { type: 'application/javascript' })
    } catch (e) {
        console.error(`Could not turn code string into blob, worker '${name}' creation failed.`)
    }
    return new Worker(URL.createObjectURL(blob))
}