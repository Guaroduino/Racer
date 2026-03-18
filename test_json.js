const json = {
    gridSize: { rows: 2, cols: 2 },
    gridParts: [],
    interactiveElements: [
        { type: "obstacle", x: 10, y: 20, width: 30, height: 40, value: 0, color: "#444", rotation: 0 }
    ]
};
const e = { target: { result: JSON.stringify(json) } };
console.log(e.target.result);
