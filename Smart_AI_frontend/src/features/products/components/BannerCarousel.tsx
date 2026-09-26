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
  // H07: user-initiated pause of the autoplay rotation
  const [isUserPaused, setIsUserPaused] = React.useState(false);
  // H07: autoplay is suspended while the banner is hovered or focused
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocusWithin, setIsFocusWithin] = React.useState(false);
  // H07: honour the OS "reduce motion" preference
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());

    api.on('select', () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  // Auto-play carousel — only while nobody paused it, hovered it, focused it,
  // or the user asked the system for reduced motion (H07)
  const isAutoplayEnabled =
    !!api && !isUserPaused && !isHovered && !isFocusWithin && !prefersReducedMotion;

  useEffect(() => {
    if (!isAutoplayEnabled) return;

    const interval = setInterval(() => {
      if (api?.canScrollNext()) {
        api.scrollNext();
      } else {
        api?.scrollTo(0);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoplayEnabled, api]);

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
    <div
      className="relative mb-12"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsFocusWithin(false);
        }
      }}
    >
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

      {/* Dots Indicator + Autoplay toggle */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <div className="flex justify-center space-x-2">
          {bannerData.map((banner, index) => (
            <button
              key={banner.id}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                current === index
                  ? 'bg-primary scale-110'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              onClick={() => api?.scrollTo(index)}
              aria-label={`Chuyển đến banner ${index + 1}`}
              aria-current={current === index}
            />
          ))}
        </div>

        {/* Play/Pause toggle (H07) */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsUserPaused((paused) => !paused)}
          aria-pressed={isUserPaused}
          aria-label={
            prefersReducedMotion
              ? 'Tự động chuyển banner đã tắt theo cài đặt hệ thống'
              : isUserPaused
                ? 'Bật lại tự động chuyển banner'
                : 'Tạm dừng tự động chuyển banner'
          }
          disabled={prefersReducedMotion}
          className="h-8 gap-2 text-muted-foreground"
        >
          {isUserPaused ? (
            <span aria-hidden="true">▶</span>
          ) : (
            <span aria-hidden="true">❚❚</span>
          )}
        </Button>
      </div>
    </div>
  );
};

export default BannerCarousel;
