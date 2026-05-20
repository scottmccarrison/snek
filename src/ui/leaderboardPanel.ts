interface ScoreEntry {
  nickname: string;
  length: number;
  submittedAt: number;
}

// Fetches and renders the global top-N scoreboard. Graceful 404/error
// handling so a missing /api/leaderboard endpoint (e.g., client deployed
// before worker) just hides the panel.
export class LeaderboardPanel {
  private root: HTMLElement;
  private listEl: HTMLOListElement;
  private titleEl: HTMLElement;
  private refreshTimer: number | null = null;

  constructor(private readonly n: number = 10) {
    this.root = document.createElement("div");
    this.root.className = "snek-leaderboard";
    this.root.style.display = "none";

    this.titleEl = document.createElement("div");
    this.titleEl.className = "snek-leaderboard-title";
    this.titleEl.textContent = "TOP SCORES";

    this.listEl = document.createElement("ol");
    this.listEl.className = "snek-leaderboard-list";

    this.root.append(this.titleEl, this.listEl);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    void this.refresh();
    this.refreshTimer = window.setInterval(() => void this.refresh(), 30_000);
  }

  destroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.root.remove();
  }

  async refresh(): Promise<void> {
    try {
      const res = await fetch(`/snek/api/leaderboard?n=${this.n}`);
      if (!res.ok) {
        this.root.style.display = "none";
        return;
      }
      const data = (await res.json()) as { scores?: ScoreEntry[] };
      const scores = data.scores ?? [];
      if (scores.length === 0) {
        this.root.style.display = "none";
        return;
      }
      this.listEl.replaceChildren(
        ...scores.map((s) => {
          const li = document.createElement("li");
          const name = document.createElement("span");
          name.className = "snek-leaderboard-name";
          name.textContent = s.nickname;
          const len = document.createElement("span");
          len.className = "snek-leaderboard-length";
          len.textContent = String(s.length);
          li.append(name, len);
          return li;
        }),
      );
      this.root.style.display = "block";
    } catch (_err) {
      this.root.style.display = "none";
    }
  }
}
