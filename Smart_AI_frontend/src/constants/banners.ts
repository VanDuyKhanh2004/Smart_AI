export interface BannerItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  buttonText: string;
  buttonLink: string;
}

export const bannerData: BannerItem[] = [
  {
    id: '1',
    title: 'iPhone 15 Pro Max',
    subtitle: 'Titanium. So strong. So light. So Pro.',
    description: 'Trải nghiệm công nghệ tiên tiến với chip A17 Pro và camera 48MP',
    image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=1200&h=600&fit=crop&crop=center&q=80',
    buttonText: 'Khám phá ngay',
    buttonLink: '/products'
  },
  {
    id: '2', 
    title: 'Samsung Galaxy S24 Ultra',
    subtitle: 'Galaxy AI is here',
    description: 'Sức mạnh AI đột phá với S Pen và camera zoom 100x',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&h=600&fit=crop&crop=center&q=80',
    buttonText: 'Xem chi tiết',
    buttonLink: '/products'
  },
  {
    id: '3',
    title: 'Google Pixel 8 Pro',
    subtitle: 'AI for the helpful kind of magic',
    description: 'Nhiếp ảnh thông minh với Google AI và camera Leica',
    image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=1200&h=600&fit=crop&crop=center&q=80',
    buttonText: 'Mua ngay',
    buttonLink: '/products'
  },
  {
    id: '4',
    title: 'Xiaomi 14 Ultra',
    subtitle: 'Photography. Redefined.',
    description: 'Hệ thống camera Leica chuyên nghiệp trên smartphone',
    image: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=1200&h=600&fit=crop&crop=center&q=80',
    buttonText: 'Tìm hiểu thêm',
    buttonLink: '/products'
  },
  {
    id: '5',
    title: 'OnePlus 12',
    subtitle: 'Never Settle',
    description: 'Hiệu năng đỉnh cao với Snapdragon 8 Gen 3 và sạc nhanh 100W',
    image: 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=1200&h=600&fit=crop&crop=center&q=80',
    buttonText: 'Khám phá ngay',
    buttonLink: '/products'
  }
];
