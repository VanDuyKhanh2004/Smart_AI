import apiClient from '@/lib/axios';
import type { AxiosProgressEvent } from 'axios';
import type {
  GetAllProductsResponse,
  GetProductByIdResponse,
  GetProductsParams,
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  DeleteProductResponse,
  ProductRecommendationResponse,
  ProductFormPayload,
} from '@/types/product.type';

export interface ProductRequestConfig {
  onUploadProgress?: (event: AxiosProgressEvent) => void;
}

function buildProductFormData(payload: ProductFormPayload): FormData {
  const formData = new FormData();
  formData.append('name', payload.name);
  formData.append('brand', payload.brand);
  formData.append('price', String(payload.price));
  formData.append('description', payload.description);
  formData.append('inStock', String(payload.inStock ?? 0));
  if (payload.colors.length > 0) {
    formData.append('colors', JSON.stringify(payload.colors));
  }
  if (payload.tags.length > 0) {
    formData.append('tags', JSON.stringify(payload.tags));
  }
  if (payload.specs) {
    formData.append('specs', JSON.stringify(payload.specs));
  }
  if (payload.imageFile) {
    formData.append('image', payload.imageFile);
  }
  return formData;
}

export const productService = {

  getAllProducts: async (params: GetProductsParams = {}): Promise<GetAllProductsResponse> => {
    try {
      const response = await apiClient.get<GetAllProductsResponse>('/products', {
        params: {
          page: params.page || 1,
          limit: params.limit || 20,
          ...(params.brand && { brand: params.brand }),
          ...(params.minPrice && { minPrice: params.minPrice }),
          ...(params.maxPrice && { maxPrice: params.maxPrice }),
          ...(params.inStock !== undefined && { inStock: params.inStock }),
          ...(params.search && { search: params.search }),
          ...(params.sortBy && { sortBy: params.sortBy }),
          ...(params.sortOrder && { sortOrder: params.sortOrder }),
          ...(params.minRating && { minRating: params.minRating }),
        },
      });

      const body = response.data;
      if (!body || typeof body !== 'object') {
        throw new Error('API returned unexpected response format');
      }
      const data = (body as GetAllProductsResponse).data;
      if (!data || typeof data !== 'object') {
        throw new Error('API returned unexpected response format');
      }
      if (!Array.isArray(data.products)) {
        throw new Error('API returned unexpected response format');
      }

      return body;
    } catch (error) {
      throw new Error(error as string);
    }
  },

 
  getProductById: async (id: string): Promise<GetProductByIdResponse> => {
    try {
      const response = await apiClient.get<GetProductByIdResponse>(`/products/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  createProduct: async (payload: ProductFormPayload, config?: ProductRequestConfig): Promise<CreateProductResponse> => {
    try {
      if (payload.imageFile) {
        const formData = buildProductFormData(payload);
        const response = await apiClient.post<CreateProductResponse>('/products', formData, {
          headers: { 'Content-Type': undefined },
          onUploadProgress: config?.onUploadProgress,
        });
        return response.data;
      }

      const data: CreateProductRequest = {
        name: payload.name,
        brand: payload.brand,
        price: payload.price,
        description: payload.description,
        inStock: payload.inStock,
        colors: payload.colors,
        tags: payload.tags,
        specs: payload.specs,
        image: payload.imageUrl,
      };
      const response = await apiClient.post<CreateProductResponse>('/products', data);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  updateProduct: async (id: string, payload: ProductFormPayload, config?: ProductRequestConfig): Promise<UpdateProductResponse> => {
    try {
      if (payload.imageFile) {
        const formData = buildProductFormData(payload);
        const response = await apiClient.put<UpdateProductResponse>(`/products/${id}`, formData, {
          headers: { 'Content-Type': undefined },
          onUploadProgress: config?.onUploadProgress,
        });
        return response.data;
      }

      const data: UpdateProductRequest = {
        name: payload.name,
        brand: payload.brand,
        price: payload.price,
        description: payload.description,
        inStock: payload.inStock,
        colors: payload.colors,
        tags: payload.tags,
        specs: payload.specs,
      };
      if (payload.clearImage) {
        data.image = '';
      } else if (payload.imageUrl) {
        data.image = payload.imageUrl;
      }
      const response = await apiClient.put<UpdateProductResponse>(`/products/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  deleteProduct: async (id: string): Promise<DeleteProductResponse> => {
    try {
      const response = await apiClient.delete<DeleteProductResponse>(`/products/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  getProductRecommendations: async (id: string, limit: number = 5): Promise<ProductRecommendationResponse> => {
    try {
      const response = await apiClient.get<ProductRecommendationResponse>(`/products/${id}/recommendations`, {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

};

// Export các hàm riêng lẻ để sử dụng trực tiếp nếu cần
export const { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct, getProductRecommendations } = productService;
