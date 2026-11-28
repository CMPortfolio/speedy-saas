/** What the practice phone needs about one bubble. */
export interface Bubble {
  id: string;
  direction: 'out' | 'in' | 'forward';
  kind: string;
  body: string;
  status: string;
  created_at: string;
}

/** One customer's conversation: texts they got and replies typed as them. */
export interface Thread {
  customerId: string;
  name: string;
  bubbles: Bubble[];
}
