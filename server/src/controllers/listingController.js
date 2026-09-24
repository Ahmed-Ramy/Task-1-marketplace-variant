import Joi from 'joi';
import { Listing } from '../models/Listing.js';

const CATEGORIES = ['textbooks', 'electronics', 'furniture', 'clothing', 'other'];
const CONDITIONS = ['new', 'like-new', 'used', 'worn'];

const createSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  description: Joi.string().allow(''),
  price: Joi.number().min(0).required(),
  category: Joi.string().valid(...CATEGORIES),
  condition: Joi.string().valid(...CONDITIONS),
  seller: Joi.string().hex().length(24)
});

const updateSchema = Joi.object({
  title: Joi.string().trim().min(1),
  description: Joi.string().allow(''),
  price: Joi.number().min(0),
  category: Joi.string().valid(...CATEGORIES),
  condition: Joi.string().valid(...CONDITIONS),
  seller: Joi.string().hex().length(24)
}).min(1);

// Only expose the seller's name and email, not their id or password.
const SELLER_FIELDS = 'name email -_id';

// Seller is null when the listing has none or it points to a deleted user.
function publicListing(l) {
  return {
    id: l._id.toString(),
    title: l.title,
    description: l.description,
    price: l.price,
    category: l.category,
    condition: l.condition,
    status: l.status,
    seller: l.seller ? { name: l.seller.name, email: l.seller.email } : null
  };
}

// GET /api/listings
// Removed listings are hidden unless ?includeRemoved=true is passed.
export async function getAllListings(req, res, next) {
  try {
    const includeRemoved = req.query.includeRemoved === 'true';
    const filter = includeRemoved ? {} : { status: { $ne: 'removed' } };

    const listings = await Listing.find(filter).populate('seller', SELLER_FIELDS).sort({ createdAt: -1 }).lean();
    res.json({ listings: listings.map(publicListing) });
  } catch (err) { next(err); }
}

// GET /api/listings/:id
// A removed listing returns 404 unless ?includeRemoved=true is passed.
export async function getListing(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id).populate('seller', SELLER_FIELDS).lean();
    const includeRemoved = req.query.includeRemoved === 'true';
    if (!listing || (listing.status === 'removed' && !includeRemoved)) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    res.json({ listing: publicListing(listing) });
  } catch (err) { next(err); }
}

// POST /api/listings
export async function createListing(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const listing = await Listing.create(value);
    await listing.populate('seller', SELLER_FIELDS);
    res.status(201).json({ listing: publicListing(listing) });
  } catch (err) { next(err); }
}

// PATCH /api/listings/:id
// Only active listings can be updated; sold or removed ones return 404.
export async function updateListing(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $set: value },
      { new: true, runValidators: true }
    ).populate('seller', SELLER_FIELDS);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    res.json({ listing: publicListing(listing) });
  } catch (err) { next(err); }
}

// DELETE /api/listings/:id
// Soft delete: marks the listing as removed instead of deleting the document,
// so it's still in the database for disputes and the audit trail.
export async function deleteListing(req, res, next) {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'removed' } },
      { $set: { status: 'removed' } },
      { new: true }
    ).populate('seller', SELLER_FIELDS);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    res.json({ listing: publicListing(listing) });
  } catch (err) { next(err); }
}

// PATCH /api/listings/:id/sold
// Only active listings can be marked as sold; sold or removed ones return 404.
export async function markAsSold(req, res, next) {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $set: { status: 'sold' } },
      { new: true }
    ).populate('seller', SELLER_FIELDS);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    res.json({ listing: publicListing(listing) });
  } catch (err) { next(err); }
}
