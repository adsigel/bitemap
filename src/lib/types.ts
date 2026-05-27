export interface Sandwich {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  bite_count: number;
  created_at: string;
}

export interface Bite {
  id: string;
  sandwich_id: string;
  x: number;
  y: number;
  created_at: string;
}
