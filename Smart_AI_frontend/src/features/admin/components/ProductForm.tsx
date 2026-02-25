import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CreateProductRequest } from '@/types/product.type';

interface ProductFormProps {
  onSubmit: (data: CreateProductRequest) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  name?: string;
  brand?: string;
  price?: string;
  description?: string;
}

export function ProductForm({ onSubmit, onCancel, isLoading = false }: ProductFormProps) {
  const [formData, setFormData] = useState<CreateProductRequest>({
    name: '',
    brand: '',
    price: 0,
    description: '',
    image: '',
    inStock: 0,
    colors: [],
    tags: [],
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [colorsInput, setColorsInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Tên sản phẩm là bắt buộc';
    }

    if (!formData.brand.trim()) {
      newErrors.brand = 'Thương hiệu là bắt buộc';
    }

    if (!formData.price || formData.price <= 0) {
      newErrors.price = 'Giá phải lớn hơn 0';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Mô tả là bắt buộc';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData: CreateProductRequest = {
      ...formData,
      colors: colorsInput ? colorsInput.split(',').map((c) => c.trim()).filter(Boolean) : [],
      tags: tagsInput ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };

    await onSubmit(submitData);
  };

  const handleInputChange = (field: keyof CreateProductRequest, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const isFormValid = formData.name.trim() && formData.brand.trim() && formData.price > 0 && formData.description.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Tên sản phẩm <span className="text-destructive">*</span>
        </label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="Nhập tên sản phẩm"
          aria-invalid={!!errors.name}
          disabled={isLoading}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="brand" className="text-sm font-medium">
          Thương hiệu <span className="text-destructive">*</span>
        </label>
        <Input
          id="brand"
          value={formData.brand}
          onChange={(e) => handleInputChange('brand', e.target.value)}
          placeholder="Nhập thương hiệu"
          aria-invalid={!!errors.brand}
          disabled={isLoading}
        />
        {errors.brand && <p className="text-sm text-destructive">{errors.brand}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium">
          Giá (VNĐ) <span className="text-destructive">*</span>
        </label>
        <Input
          id="price"
          type="number"
          value={formData.price || ''}
          onChange={(e) => handleInputChange('price', Number(e.target.value))}
          placeholder="Nhập giá sản phẩm"
          aria-invalid={!!errors.price}
          disabled={isLoading}
          min={0}
        />
        {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Mô tả <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="Nhập mô tả sản phẩm"
          aria-invalid={!!errors.description}
          disabled={isLoading}
          rows={3}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="image" className="text-sm font-medium">
          URL hình ảnh
        </label>
        <Input
          id="image"
          value={formData.image || ''}
          onChange={(e) => handleInputChange('image', e.target.value)}
          placeholder="Nhập URL hình ảnh"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="inStock" className="text-sm font-medium">
          Số lượng tồn kho
        </label>
        <Input
          id="inStock"
          type="number"
          value={formData.inStock || ''}
          onChange={(e) => handleInputChange('inStock', Number(e.target.value))}
          placeholder="Nhập số lượng"
          disabled={isLoading}
          min={0}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="colors" className="text-sm font-medium">
          Màu sắc (phân cách bằng dấu phẩy)
        </label>
        <Input
          id="colors"
          value={colorsInput}
          onChange={(e) => setColorsInput(e.target.value)}
          placeholder="Đen, Trắng, Xanh"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="tags" className="text-sm font-medium">
          Tags (phân cách bằng dấu phẩy)
        </label>
        <Input
          id="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="flagship, 5G, camera"
          disabled={isLoading}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Hủy
        </Button>
        <Button type="submit" disabled={isLoading || !isFormValid}>
          {isLoading ? 'Đang xử lý...' : 'Thêm sản phẩm'}
        </Button>
      </div>
    </form>
  );
}
