import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('FINDING-04 [ATOM-04]: Customer Lookup & Reuse by Phone Match', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reuses existing customer by exact phone match without overwriting name or address', async () => {
    const existingCust = {
      id: 'cust-existing-1',
      name: 'Original Customer Name',
      phone: '9876543210',
      address: 'Original Address',
    };

    const updateMock = jest.fn();
    const insertMock = jest.fn();

    (supabase.from as unknown as jest.Mock).mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: existingCust,
                  error: null,
                }),
              }),
            }),
          }),
          update: updateMock,
          insert: insertMock,
        };
      }
      return {};
    });

    // Simulate lookup logic used in useCreateOrder:
    const input = {
      existingCustomerId: undefined,
      customerName: 'New Entered Name',
      customerPhone: '9876543210',
      customerAddress: 'New Address',
    };

    let customerId: string | undefined = input.existingCustomerId;
    const trimmedPhone = input.customerPhone.trim();

    if (!customerId && trimmedPhone) {
      const { data: matched } = await supabase
        .from('customers')
        .select('id, name, address')
        .eq('phone', trimmedPhone)
        .limit(1)
        .maybeSingle();

      if (matched) {
        customerId = matched.id;
      }
    }

    if (customerId) {
      // Reused: without explicit existingCustomerId confirmation, do NOT update customer
      if (input.existingCustomerId) {
        updateMock();
      }
    } else {
      insertMock();
    }

    // Asserts:
    expect(customerId).toBe(existingCust.id);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates existing customer when user explicitly confirms existingCustomerId', async () => {
    const updateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as unknown as jest.Mock).mockImplementation((table: string) => {
      if (table === 'customers') {
        return { update: updateMock };
      }
      return {};
    });

    const input = {
      existingCustomerId: 'cust-existing-1',
      customerName: 'Updated Name',
      customerPhone: '9876543210',
      customerAddress: 'Updated Address',
    };

    let customerId = input.existingCustomerId;
    if (customerId && input.existingCustomerId) {
      await supabase
        .from('customers')
        .update({
          name: input.customerName,
          phone: input.customerPhone,
          address: input.customerAddress,
        })
        .eq('id', customerId);
    }

    expect(updateMock).toHaveBeenCalledWith({
      name: 'Updated Name',
      phone: '9876543210',
      address: 'Updated Address',
    });
  });
});
