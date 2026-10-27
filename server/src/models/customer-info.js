const FIELD_LIMITS = { name: 200, contactEmail: 254, industry: 200, region: 200 };

function validateCustomerInfo(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const customer = {};
  const errors = {};

  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = source[field];
    customer[field] = typeof value === 'string' ? value.trim() : '';
    if (value != null && typeof value !== 'string') {
      errors[field] = 'Enter text for this field.';
    } else if (customer[field].length > limit) {
      errors[field] = `Use ${limit} characters or fewer.`;
    }
  }

  if (!errors.name && !customer.name) errors.name = 'Enter a company name.';
  if (!errors.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.contactEmail)) {
    errors.contactEmail = 'Enter a valid contact email.';
  }

  return { customer, errors };
}

module.exports = { validateCustomerInfo };
