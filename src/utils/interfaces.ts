export interface Filters {
    location?: {
      city: string;
      district?: string;
    };
    distance?: {
      min: number;
      max: number;
    };
    type?: string[];
    category?: string[];
    date?: string[];
    size?: string[];
  }