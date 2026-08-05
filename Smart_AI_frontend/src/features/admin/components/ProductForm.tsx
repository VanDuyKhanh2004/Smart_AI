import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  Product,
  ProductFormPayload,
  ProductImageSource,
} from '@/types/product.type';

interface ProductFormProps {
  onSubmit: (data: ProductFormPayload) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  uploadProgress?: number | null;
  initialData?: Product;
}

interface FormErrors {
  name?: string;
  brand?: string;
  price?: string;
  description?: string;
  image?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProductForm({ onSubmit, onCancel, isLoading = false, uploadProgress = null, initialData }: ProductFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    brand: initialData?.brand || '',
    price: initialData?.price || 0,
    description: initialData?.description || '',
    inStock: initialData?.inStock ?? 0,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [colorsInput, setColorsInput] = useState(
    initialData?.colors ? initialData.colors.join(', ') : ''
  );
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags ? initialData.tags.join(', ') : ''
  );

  const [imageSource, setImageSource] = useState<ProductImageSource>(initialData ? 'url' : 'file');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(initialData?.image || '');
  const [imageError, setImageError] = useState<string | null>(null);
  const [clearedImage, setClearedImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const objectUrlRef = useRef<string | null>(null);
  const isEditMode = !!initialData;

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
  };

  useEffect(() => {
    return () => revokeObjectUrl();
  }, []);

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

    if (imageSource === 'file' && imageFile) {
      const fileError = validateFile(imageFile);
      if (fileError) {
        newErrors.image = fileError;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WebP.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'Kích thước ảnh không được vượt quá 5MB.';
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const fileError = validateFile(file);
    if (fileError) {
      setImageError(fileError);
      setImageFile(null);
      revokeObjectUrl();
      e.target.value = '';
      return;
    }

    setImageError(null);
    setClearedImage(false);
    revokeObjectUrl();
    objectUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(objectUrlRef.current);
    setImageFile(file);
    e.target.value = '';
  };

  const handleClearImage = () => {
    setClearedImage(true);
    setImageFile(null);
    setImageUrl('');
    setImageError(null);
    revokeObjectUrl();
  };

  const handleSwitchSource = (source: ProductImageSource) => {
    if (source === imageSource) {
      return;
    }
    setImageSource(source);
    setPreviewFailed(false);
    if (source === 'file') {
      // Switching to file mode clears the URL being submitted.
      setImageUrl('');
    } else {
      // Switching to URL mode clears the selected file.
      setImageFile(null);
      revokeObjectUrl();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const colors = colorsInput ? colorsInput.split(',').map((c) => c.trim()).filter(Boolean) : [];
    const tags = tagsInput ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [];

    // Untouched existing image in edit mode: omit image entirely so the
    // backend preserves the current image.
    const isSameAsExisting = isEditMode && imageSource === 'url' && imageUrl === (initialData?.image || '');

    const submitData: ProductFormPayload = {
      name: formData.name,
      brand: formData.brand,
      price: formData.price,
      description: formData.description,
      inStock: formData.inStock,
      colors,
      tags,
      imageSource,
      imageFile: imageSource === 'file' ? imageFile : null,
      imageUrl: isSameAsExisting ? '' : imageSource === 'url' ? imageUrl : '',
      clearImage: isEditMode ? clearedImage : undefined,
    };

    await onSubmit(submitData);
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const previewSrc = imageFile
    ? previewUrl
    : imageSource === 'url' && imageUrl
    ? imageUrl
    : isEditMode && !clearedImage && initialData?.image
    ? initialData.image
    : null;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewSrc]);

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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Hình ảnh sản phẩm</legend>

        <div className="flex gap-4" role="radiogroup" aria-label="Chọn nguồn hình ảnh">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="imageSource"
              value="file"
              checked={imageSource === 'file'}
              onChange={() => handleSwitchSource('file')}
              disabled={isLoading}
            />
            Tải ảnh từ thiết bị
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="imageSource"
              value="url"
              checked={imageSource === 'url'}
              onChange={() => handleSwitchSource('url')}
              disabled={isLoading}
            />
            Nhập URL hình ảnh
          </label>
        </div>

        {imageSource === 'file' ? (
          <div className="space-y-2">
            <label htmlFor="productImageFile" className="text-sm font-medium">
              Chọn ảnh từ thiết bị
            </label>
            <Input
              id="productImageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isLoading}
              aria-invalid={!!imageError}
              aria-describedby={imageError ? 'product-image-error' : 'product-image-help'}
            />
            <p id="product-image-help" className="text-sm text-muted-foreground">
              Chấp nhận JPG, PNG, WebP. Kích thước tối đa 5MB.
            </p>
            {imageError && (
              <p id="product-image-error" className="text-sm text-destructive">
                {imageError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="productImageUrl" className="text-sm font-medium">
              URL hình ảnh
            </label>
            <Input
              id="productImageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Nhập URL hình ảnh"
              disabled={isLoading}
            />
          </div>
        )}

        {previewSrc && (
          <div className="space-y-1">
            <div className="h-40 w-full max-w-xs overflow-hidden rounded-md border">
              <img
                key={previewSrc}
                src={previewSrc}
                alt="Xem trước hình ảnh sản phẩm"
                className="h-full w-full object-contain"
                onError={() => setPreviewFailed(true)}
                onLoad={() => setPreviewFailed(false)}
              />
            </div>
            {previewFailed && (
              <p className="text-sm text-muted-foreground">
                Không thể xem trước hình ảnh từ URL này.
              </p>
            )}
          </div>
        )}

        {isEditMode && !clearedImage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearImage}
            disabled={isLoading}
          >
            Xóa hình ảnh hiện tại
          </Button>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="inStock" className="text-sm font-medium">
          Số lượng tồn kho
        </label>
        <Input
          id="inStock"
          type="number"
          value={formData.inStock ?? ''}
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
          {isLoading
            ? uploadProgress != null && uploadProgress > 0
              ? `Đang tải ảnh... ${uploadProgress}%`
              : 'Đang xử lý...'
            : (isEditMode ? 'Lưu thay đổi' : 'Thêm sản phẩm')}
        </Button>
      </div>
    </form>
  );
}
