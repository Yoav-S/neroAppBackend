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

    // Distance filter (to be implemented based on your distance logic)
    if (filters.distance) {
        if (filters.distance.min !== undefined || filters.distance.max !== undefined) {
            // Implement distance filtering logic here based on your data structure
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

    // Date filtering (placeholder logic)
    if (filters.date && filters.date.length === 2) {
        const [startDate, endDate] = filters.date;
        filterQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // Size filtering
    if (filters.size && filters.size.length > 0) {
        filterQuery.size = { $in: filters.size };
    }

    return filterQuery;
}
