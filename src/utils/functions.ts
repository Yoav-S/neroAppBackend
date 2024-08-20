import { Filter } from 'mongodb';
import { Filters } from './interfaces';

export async function createFilterQuery(filters: Filters, categoriesCollection: any): Promise<Filter<any>> {
    const filterQuery: Filter<any> = {};
  
    // Location filtering
    if (filters.location) {
      if (filters.location.city) {
        filterQuery['location.city'] = new RegExp(filters.location.city, 'i');
      }
      if (filters.location.district) {
        filterQuery['location.district'] = new RegExp(filters.location.district, 'i');
      }
    }
  
    // Post type filtering
    if (filters.type && filters.type.length > 0) {
      filterQuery.postType = { $in: filters.type };
    }
  
    // Category filtering
    if (filters.category && filters.category.length > 0) {
      const categoryIds = await categoriesCollection.find({ name: { $in: filters.category } }).toArray();
      filterQuery.category = { $in: categoryIds.map((cat: any) => cat._id) };
    }
  
    // Date filtering based on the provided time period
    if (filters.date && filters.date.length > 0) {
      const dateFilter = getDateRange(filters.date[0]);
      if (dateFilter) {
        filterQuery.createdAt = dateFilter;
      }
    }
  
    // Size filtering
    if (filters.size && filters.size.length > 0) {
      filterQuery.size = { $in: filters.size };
    }
  
    return filterQuery;
  }
  
  // Helper function to get the date range based on the provided time period
  function getDateRange(timePeriod: string): Filter<any> | null {
    const now = new Date();
  
    switch (timePeriod) {
      case "Last 24 hours":
        return { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }; // Last 24 hours
      case "Last week":
        return { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }; // Last 7 days
      case "Last month":
        return { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }; // Last 30 days
      default:
        return null;
    }
  }
  
