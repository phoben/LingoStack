import tempfile
import unittest
from pathlib import Path

from publish_immutable import ImmutableConflict, publish_immutable


class NotFound(Exception):
    def get_status_code(self):
        return 404


class ProbeFailed(Exception):
    def get_status_code(self):
        return 500


class PreconditionFailed(Exception):
    def get_status_code(self):
        return 412


class FakeCos:
    def __init__(self, objects=None, probe_error=None, upload_error=None):
        self.objects = dict(objects or {})
        self.probe_error = probe_error
        self.upload_error = upload_error
        self.uploads = []

    def head_object(self, **kwargs):
        if self.probe_error:
            raise self.probe_error
        if kwargs["Key"] not in self.objects:
            raise NotFound()

    def download_file(self, bucket, key, destination):
        Path(destination).write_bytes(self.objects[key])

    def put_object(self, *, Bucket, Key, Body, **kwargs):
        if self.upload_error:
            raise self.upload_error
        self.uploads.append((Key, kwargs))
        self.objects[Key] = Body.read()


class PublishImmutableTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.source = Path(self.directory.name) / "artifact.exe"
        self.source.write_bytes(b"signed artifact")

    def tearDown(self):
        self.directory.cleanup()

    def publish(self, cos):
        return publish_immutable(
            cos,
            bucket="bucket-123",
            key="releases/0.0.3/windows-x86_64/artifact.exe",
            source=self.source,
            cache_control="public, max-age=31536000, immutable",
        )

    def test_absent_object_is_uploaded_once(self):
        cos = FakeCos()
        self.assertEqual(self.publish(cos), "uploaded")
        self.assertEqual(len(cos.uploads), 1)
        self.assertEqual(cos.uploads[0][1]["IfNoneMatch"], "*")

    def test_identical_existing_object_is_reused_without_upload(self):
        cos = FakeCos({"releases/0.0.3/windows-x86_64/artifact.exe": b"signed artifact"})
        self.assertEqual(self.publish(cos), "reused")
        self.assertEqual(cos.uploads, [])

    def test_different_existing_object_fails_closed_without_upload(self):
        cos = FakeCos({"releases/0.0.3/windows-x86_64/artifact.exe": b"different"})
        with self.assertRaises(ImmutableConflict):
            self.publish(cos)
        self.assertEqual(cos.uploads, [])

    def test_probe_failure_never_uploads(self):
        cos = FakeCos(probe_error=ProbeFailed())
        with self.assertRaises(RuntimeError):
            self.publish(cos)
        self.assertEqual(cos.uploads, [])

    def test_concurrent_create_is_reused_only_after_a_content_match(self):
        cos = FakeCos(
            {"releases/0.0.3/windows-x86_64/artifact.exe": b"signed artifact"},
            upload_error=PreconditionFailed(),
        )
        # The initial probe needs to be absent; emulate a second writer adding
        # the matching bytes before COS evaluates our If-None-Match request.
        initial_head = cos.head_object
        calls = 0

        def head_once_absent(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise NotFound()
            return initial_head(**kwargs)

        cos.head_object = head_once_absent
        self.assertEqual(self.publish(cos), "reused")
        self.assertEqual(cos.uploads, [])

    def test_concurrent_create_with_different_bytes_fails_closed(self):
        cos = FakeCos(
            {"releases/0.0.3/windows-x86_64/artifact.exe": b"other publisher"},
            upload_error=PreconditionFailed(),
        )
        initial_head = cos.head_object
        calls = 0

        def head_once_absent(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise NotFound()
            return initial_head(**kwargs)

        cos.head_object = head_once_absent
        with self.assertRaises(ImmutableConflict):
            self.publish(cos)
        self.assertEqual(cos.uploads, [])


if __name__ == "__main__":
    unittest.main()
