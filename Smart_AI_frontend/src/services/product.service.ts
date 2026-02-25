import apiClient from '@/lib/axios';
import type {
  GetAllProductsResponse,
  GetProductByIdResponse,
  GetProductsParams,
  CreateProductRequest,
  CreateProductResponse,
  DeleteProductResponse,
} from '@/types/product.type';


export const productService = {

  getAllProducts: async (params: GetProductsParams = {}): Promise<GetAllProductsResponse> => {
    try {
      const response = await apiClient.get<GetAllProductsResponse>('/products', {
        params: {
          page: params.page || 1,
          limit: params.limit ||20,
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

      return response.data;
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

  createProduct: async (data: CreateProductRequest): Promise<CreateProductResponse> => {
    try {
      const response = await apiClient.post<CreateProductResponse>('/products', data);
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

};

// Export các hàm riêng lẻ để sử dụng trực tiếp nếu cần
export const { getAllProducts, getProductById, createProduct, deleteProduct } = productService;
