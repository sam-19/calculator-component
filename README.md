Calculator component
====================

A basic calculator component that scales to the space available to it. Includes a helper to fill in unclosed parentheses and prevents entering some obvious errors. Evaluating the expressions is carried out in a worker to prevent possible errors from affecting the main thread.

The calculator uses [Math.js](https://github.com/josdejong/mathjs) to evaluate mathematical expressions.