import React, { useEffect } from 'react';
import { renderToString } from 'react-dom/server';

function Child() {
  console.log("Child render");
  return <div>Child</div>;
}

function App() {
  console.log("App render");
  const Invalid = undefined;
  return (
    <div>
      <Child />
      <Invalid />
    </div>
  );
}

try {
  renderToString(<App />);
} catch (e) {
  console.log("Caught:", e.message);
}
