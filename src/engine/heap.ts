/** Indexed min heap: exactly one live entry per cell; priorities live in engine arrays. */
export class IndexedHeap {
  readonly cells: Int32Array;
  readonly positions: Int32Array;
  size = 0;
  constructor(
    capacity: number,
    private before: (a: number, b: number) => boolean,
  ) {
    this.cells = new Int32Array(capacity);
    this.positions = new Int32Array(capacity).fill(-1);
  }
  get bytes() {
    return this.cells.byteLength + this.positions.byteLength;
  }
  update(id: number) {
    let i = this.positions[id];
    if (i < 0) {
      i = this.size++;
      this.cells[i] = id;
      this.positions[id] = i;
    }
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (!this.before(this.cells[i], this.cells[p])) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    if (!this.size) throw new Error("Cannot pop an empty frontier");
    const id = this.cells[0];
    this.positions[id] = -1;
    this.size--;
    if (this.size) {
      this.cells[0] = this.cells[this.size];
      this.positions[this.cells[0]] = 0;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        if (left >= this.size) break;
        const right = left + 1;
        const child =
          right < this.size && this.before(this.cells[right], this.cells[left])
            ? right
            : left;
        if (!this.before(this.cells[child], this.cells[i])) break;
        this.swap(i, child);
        i = child;
      }
    }
    return id;
  }
  private swap(a: number, b: number) {
    const t = this.cells[a];
    this.cells[a] = this.cells[b];
    this.cells[b] = t;
    this.positions[this.cells[a]] = a;
    this.positions[this.cells[b]] = b;
  }
}
