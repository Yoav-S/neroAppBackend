import { Filter } from 'mongodb';
import { Filters } from './interfaces';



export async function createFilterQuery(filters: Filters, categoriesCollection: any): Promise<Filter<any>> {
    const filterQuery: Filter<any> = {};
  
    if (filters.location && (filters.location.city || filters.location.district)) {
      filterQuery['location.city'] = filters.location.city ? new RegExp(filters.location.city, 'i') : { $exists: true };
      if (filters.location.district) {
        filterQuery['location.district'] = new RegExp(filters.location.district, 'i');
      }
    }
  
    // Distance filter (placeholder)
    if (filters.distance && (filters.distance.min !== undefined || filters.distance.max !== undefined)) {
      // Implement distance filtering logic here
    }
  
    if (filters.type && filters.type.length > 0) {
      filterQuery.postType = { $in: filters.type };
    }
  
    if (filters.category && filters.category.length > 0) {
      const categoryIds = await categoriesCollection.find({ name: { $in: filters.category } }).toArray();
      filterQuery.category = { $in: categoryIds.map((cat: any) => cat._id) };
    }
  
    if (filters.date && filters.date.length > 0) {
      // Implement date filtering logic based on your requirements
      // This is a placeholder
      filterQuery.createdAt = { $gte: new Date(filters.date[0]), $lte: new Date(filters.date[1]) };
    }
  
    if (filters.size && filters.size.length > 0) {
      filterQuery.size = { $in: filters.size };
    }
  
    return filterQuery;
  }