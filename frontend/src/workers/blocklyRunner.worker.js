self.onmessage = function ({ data: { code } }) {
  var lines = [];
  function print() {
    lines.push(Array.prototype.join.call(arguments, ' '));
  }
  try {
    new Function('print', code)(print);
    self.postMessage({ output: lines.join('\n'), error: null });
  } catch (e) {
    self.postMessage({ output: null, error: e.message });
  }
};
