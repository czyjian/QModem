#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <qmodem-sms/pdu.h>

static void test_udl_flag_is_not_udhi(void)
{
    unsigned char pdu[15 + 64] = {
        0x00, 0x04, 0x02, 0x81, 0x21, 0x00, 0x08,
        0x62, 0x90, 0x11, 0x21, 0x43, 0x65, 0x00, 0x40
    };
    char sender[16] = {0};
    char text[128] = {0};
    time_t timestamp;
    int dcs, reference, total, part, skip;

    pdu[15] = 0x0a;
    assert(pdu_decode(pdu, sizeof(pdu), &timestamp, sender, sizeof(sender),
                      text, sizeof(text), &dcs, &reference, &total, &part,
                      &skip) == 64);
    assert(dcs == 0x08);
    assert(skip == 0);
}

int main(void)
{
    unsigned char pdus[SMS_MAX_PARTS][SMS_MAX_PDU_LENGTH];
    int lengths[SMS_MAX_PARTS];
    char long_text[81];
    int parts;

    memset(long_text, 'A', 80);
    long_text[80] = '\0';
    parts = pdu_encode_ucs2_parts("18675170156", "test短信", pdus, lengths,
                                  SMS_MAX_PARTS, 42);
    assert(parts == 1);
    assert(pdus[0][1] == 0x11);
    assert(pdus[0][4] == 0x91);
    assert(lengths[0] > 10);
    parts = pdu_encode_ucs2_parts("18675170156", long_text, pdus, lengths,
                                  SMS_MAX_PARTS, 42);
    assert(parts == 2);
    assert(pdus[0][1] == 0x51 && pdus[1][1] == 0x51);
    assert(memmem(pdus[0], lengths[0], "\x05\x00\x03\x2a\x02\x01", 6));
    assert(memmem(pdus[1], lengths[1], "\x05\x00\x03\x2a\x02\x02", 6));
    assert(pdu_encode_ucs2_parts("10086", "\xc0\xaf", pdus, lengths,
                                 SMS_MAX_PARTS, 1) < 0);
    assert(pdu_encode_ucs2_parts_typed("8617607123407", "test", pdus, lengths,
                                      SMS_MAX_PARTS, 1, 1) == 1);
    assert(pdus[0][3] == 13 && pdus[0][4] == 0x91);
    assert(memcmp(pdus[0] + 5, "\x68\x71\x06\x17\x32\x04\xf7", 7) == 0);
    assert(pdu_encode_ucs2_parts_typed("10659200", long_text, pdus, lengths,
                                      SMS_MAX_PARTS, 1, 0) == 2);
    assert(pdus[0][3] == 8 && pdus[0][4] == 0x81 && pdus[1][4] == 0x81);
    assert(pdu_encode_ucs2_parts_typed("+8617607123407", "test", pdus, lengths,
                                      SMS_MAX_PARTS, 1, 1) < 0);
    assert(pdu_encode_ucs2_parts_typed("123456789012345678901", "test", pdus, lengths,
                                      SMS_MAX_PARTS, 1, 1) < 0);
    test_udl_flag_is_not_udhi();
    puts("PASS UCS-2 single, multipart, and invalid UTF-8 encoding");
    return 0;
}
