export interface Offer {
  id: string;
  title: string;
  description: string;
  originalPrice: number | null;
  discountPrice: number | null;
  platform: string;
  affiliateUrl: string;
  category: string;
  imageUrl?: string;
  published: boolean;
  publishedAt?: string;
  expired?: boolean;
  expiredAt?: string;
}
