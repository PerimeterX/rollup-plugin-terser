const { codeFrameColumns } = require("@babel/code-frame");
const Worker = require("jest-worker").default;
const serialize = require("serialize-javascript");

function terser(userOptions = {}) {
  if (userOptions.sourceMap != null) {
    throw Error("sourceMap option is removed, use sourcemap instead");
  }

  return {
    name: "terser",

    renderChunk(code, chunk, outputOptions) {
      if (!this.worker) {
        this.worker = new Worker(require.resolve("./transform.js"), {
          numWorkers: userOptions.numWorkers
        });
        this.numOfBundles = 0;
      }

      this.numOfBundles++;

      // TODO rewrite with object spread after node6 drop
      const normalizedOptions = Object.assign({}, userOptions, {
        sourceMap: userOptions.sourcemap,
        module: outputOptions.format === "es" || outputOptions.format === "esm"
      });

      for (let key of ["sourcemap", "numWorkers"]) {
        if (normalizedOptions.hasOwnProperty(key)) {
          delete normalizedOptions[key];
        }
      }

      if (normalizedOptions.sourceMap && normalizedOptions.sourceMap.get_content) {
        const typeofGetContent = typeof normalizedOptions.sourceMap.get_content;
        if (typeofGetContent !== 'function') {
          throw Error(`'get_content' field of sourcemap option must be of type Function (got ${typeofGetContent} instead)`);
        }

        normalizedOptions.sourceMap.content = normalizedOptions.sourceMap.get_content();

        const typeofContent = typeof normalizedOptions.sourceMap.content;
        if (typeofContent !== 'string') {
          throw Error(`'content' field of sourcemap option must be of type Function (got ${typeofContent} instead)`);
        }

        delete normalizedOptions.sourceMap.get_content;
      }

      const serializedOptions = serialize(normalizedOptions);

      const result = this.worker
        .transform(code, serializedOptions)
        .catch(error => {
          const { message, line, col: column } = error;
          console.error(
            codeFrameColumns(code, { start: { line, column } }, { message })
          );
          throw error;
        });

      const handler = () => {
        this.numOfBundles--;

        if (this.numOfBundles === 0) {
          this.worker.end();
          this.worker = 0;
        }
      };

      result.then(handler, handler);

      return result;
    }
  };
}

exports.terser = terser;
