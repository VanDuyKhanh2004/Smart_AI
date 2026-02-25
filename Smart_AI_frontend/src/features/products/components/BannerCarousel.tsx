import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { bannerData, type BannerItem } from '@/constants/banners';

const BannerCarousel: React.FC = () => {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());

    api.on('select', () => {
      setCurrent(api.selectedScrollSnap());
    });

    // Auto-play carousel
    const interval = setInterval(() => {
      if (api.canScrollNext()) {
        api.scrollNext();
      } else {
        api.scrollTo(0);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [api]);

  const BannerSlide: React.FC<{ banner: BannerItem }> = ({ banner }) => (
    <div className="relative w-full h-[400px] md:h-[500px] overflow-hidden rounded-xl">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${banner.image})` }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex items-center h-full">
        <div className="container mx-auto px-6 md:px-12">
          <div className="max-w-2xl text-white drop-shadow-lg">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight drop-shadow-md">
              {banner.title}
            </h1>
            <p className="text-xl md:text-2xl mb-4 font-medium drop-shadow-sm">
              {banner.subtitle}
            </p>
            <p className="text-base md:text-lg mb-8 leading-relaxed drop-shadow-sm">
              {banner.description}
            </p>
            <Link to={banner.buttonLink}>
              <Button 
                size="lg" 
                className="bg-white text-black hover:bg-gray-100 font-semibold px-8 py-3 text-lg shadow-lg"
              >
                {banner.buttonText}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative mb-12">
      <Carousel 
        setApi={setApi}
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent>
          {bannerData.map((banner) => (
            <CarouselItem key={banner.id}>
              <Card className="border-0 shadow-none">
                <CardContent className="p-0">
                  <BannerSlide banner={banner} />
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        
        {/* Navigation Buttons */}
        <CarouselPrevious className="left-4 md:left-8 bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30" />
        <CarouselNext className="right-4 md:right-8 bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30" />
      </Carousel>

      {/* Dots Indicator */}
      <div className="flex justify-center mt-6 space-x-2">
        {bannerData.map((_, index) => (
          <button
            key={index}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              current === index 
                ? 'bg-primary scale-110' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
            onClick={() => api?.scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default BannerCarousel;
